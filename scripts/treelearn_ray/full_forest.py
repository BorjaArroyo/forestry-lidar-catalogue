"""Full frozen Wytham validation cloud: tiled inference, instances, and audited evaluation."""
import importlib.util
import json
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import time


def configure(config, forest_path, checkpoint):
    config.forest_path = str(forest_path)
    config.pretrain = str(checkpoint)
    config.fp16 = False
    config.tile_generation = True
    config.dataloader.batch_size = 1
    config.dataloader.num_workers = 0
    config.shape_cfg.outer_remove = None
    config.save_cfg.save_formats = ["npy"]
    config.save_cfg.save_treewise = False
    config.save_cfg.save_pointwise = False
    config.save_cfg.return_type = "original"
    config.save_cfg.results_dir = "results"
    return config


def run(input_dir, output_dir):
    import numpy as np
    import torch
    import yaml
    import tree_learn.util.pipeline as functions
    from tree_learn.util import get_config, munch_to_dict
    from driver import sha256, INPUTS
    out = Path(output_dir)
    lock = json.loads((Path(__file__).parent / "checkpoint-lock.json").read_text())
    if shutil.disk_usage("/tmp").free < 20 * 1024**3:
        raise RuntimeError("Full workflow requires at least 20 GiB free worker scratch space")
    checkpoint_source = Path(input_dir).parent / "checkpoints" / (lock["sha256"] + ".pth")
    counters = {}
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="canopy-full-forest-") as scratch:
        local = Path(scratch)
        gt_path = local / "gt.npy"
        shutil.copyfile(Path(input_dir) / "gt/wytham_val_voxel01_gt.npy", gt_path)
        if sha256(gt_path) != INPUTS["gt/wytham_val_voxel01_gt.npy"]:
            raise ValueError("Frozen Wytham input hash mismatch")
        checkpoint = local / "weights.pth"
        shutil.copyfile(checkpoint_source, checkpoint)
        if checkpoint.stat().st_size != lock["size_bytes"] or sha256(checkpoint) != lock["sha256"]:
            raise ValueError("Checkpoint SHA256 or size mismatch")
        gt = np.load(gt_path, mmap_mode="r", allow_pickle=False)
        if gt.shape != (3378949, 4) or not np.isfinite(gt).all():
            raise ValueError("Unexpected frozen input schema")
        forest = local / "cloud/forest/wytham.npy"
        forest.parent.mkdir(parents=True)
        # Geometry-only input; upstream creates ignored placeholder labels for inference.
        np.save(forest, np.asarray(gt[:, :3]))
        os.chdir("/opt/TreeLearn")
        config = configure(get_config("configs/pipeline/pipeline.yaml"), forest, checkpoint)
        (out / "pipeline-config.yaml").write_text(yaml.safe_dump(munch_to_dict(config)))
        np.random.seed(0); random.seed(0); torch.manual_seed(0); torch.cuda.manual_seed_all(0)
        functions.N_JOBS = 8
        spec = importlib.util.spec_from_file_location("upstream_treelearn_pipeline", "/opt/TreeLearn/tools/pipeline/pipeline.py")
        pipeline = importlib.util.module_from_spec(spec); spec.loader.exec_module(pipeline)

        def strict_load(path, logger, model, optimizer=None, strict=True):
            if optimizer is not None: raise ValueError("Inference must not load optimizer state")
            state = torch.load(path, map_location="cpu", weights_only=True)
            model.load_state_dict(state["net"], strict=True)
            counters["checkpoint_epoch"] = int(state.get("epoch", 0))
            return counters["checkpoint_epoch"] + 1
        pipeline.load_checkpoint = strict_load

        original_preds = pipeline.get_pointwise_preds
        def checked_preds(model, loader, cfg, logger=None):
            counts = []
            class CountedLoader:
                def __len__(self): return len(loader)
                def __iter__(self):
                    for batch in loader:
                        counts.append(int(batch["masks_inner"].sum()))
                        yield batch
            result = original_preds(model, CountedLoader(), cfg, logger)
            if len(result[4]) != sum(counts):
                raise RuntimeError("Upstream skipped an inference tile; refusing incomplete predictions")
            counters.update(tiles=len(counts), overlapping_inner_predictions=sum(counts))
            return result
        pipeline.get_pointwise_preds = checked_preds

        original_ensemble = pipeline.ensemble
        def counted_ensemble(*args):
            result = original_ensemble(*args)
            counters["ensembled_points"] = len(result[0])
            return result
        pipeline.ensemble = counted_ensemble
        original_propagation = pipeline.propagate_preds_hash_full
        def counted_propagation(*args):
            result = original_propagation(*args)
            counters["points_requiring_knn_fallback"] = int(result[1].sum())
            return result
        pipeline.propagate_preds_hash_full = counted_propagation
        pipeline_start = time.monotonic()
        try:
            pipeline.run_treelearn_pipeline(config)
            counters["pipeline_seconds"] = time.monotonic() - pipeline_start
            prediction_path = local / "cloud/results/full_forest/wytham.npy"
            prediction = np.load(prediction_path, mmap_mode="r", allow_pickle=False)
            if prediction.shape != gt.shape or not np.isfinite(prediction).all():
                raise ValueError("Incomplete or nonfinite full-forest predictions")
            if not np.allclose(prediction[:, :3], gt[:, :3], rtol=0, atol=1e-7):
                raise ValueError("Output coordinates/order differ from the frozen input")
            ids = prediction[:, 3]
            if (ids < 0).any() or not np.equal(ids, np.floor(ids)).all():
                raise ValueError("Unassigned or nonintegral final instance IDs")
            counters.update(points=len(prediction), predicted_instances=int(len(np.unique(ids[ids > 0]))),
                            non_tree_points=int((ids == 0).sum()))
            if counters["predicted_instances"] == 0:
                raise ValueError("Full pipeline produced no tree instances")
            shutil.copyfile(prediction_path, out / "instance-predictions.npy")
            thresholds = {"min_iou_for_match": .5, "min_precision_for_pred": .5, "min_recall_for_gt": .5}
            evaluation_config = {"paths": {"gt_forest_path": str(gt_path), "pred_forest_path": str(prediction_path)},
                "thresholds": thresholds, "partitions": {"xy_partition": [i / 10 for i in range(11)], "z_partition": [i / 10 for i in range(11)]}}
            eval_path = local / "evaluation.yaml"; eval_path.write_text(yaml.safe_dump(evaluation_config))
            shutil.copyfile(eval_path, out / "evaluation-config.yaml")
            with (out / "evaluator.log").open("w") as log:
                subprocess.run([sys.executable, "/opt/canopy/partition_policy.py", "--config", str(eval_path),
                                "--report", str(out / "partition-policy.json")], check=True, stdout=log, stderr=subprocess.STDOUT, timeout=1800)
            evaluation = prediction_path.parent / "evaluation"
            shutil.copytree(evaluation, out / "evaluation")
            scores = torch.load(evaluation / "evaluation_results.pt", map_location="cpu", weights_only=False)
            metrics = {"detection": {k: float(scores["detection_results"][k]) for k in
                ("completeness", "omission_error_rate", "commission_error_rate", "f1_score")},
                "segmentation": {k: float(scores["segmentation_results"][k]) for k in ("precision", "recall", "iou")}}
            (out / "metrics-summary.json").write_text(json.dumps(metrics, indent=2) + "\n")
        finally:
            documentation = local / "cloud/documentation"
            if documentation.exists(): shutil.copytree(documentation, out / "documentation")
            counters["elapsed_seconds"] = time.monotonic() - started
            (out / "coverage.json").write_text(json.dumps(counters, indent=2) + "\n")
        return {"scope": "Full tiled instance segmentation of the frozen 3378949-point Wytham validation export, not the 30497066-point raw acquisition or independent benchmark reproduction",
                "coverage": counters, "metrics": metrics, "device": torch.cuda.get_device_name(0),
                "input_sha256": INPUTS["gt/wytham_val_voxel01_gt.npy"], "checkpoint_sha256": lock["sha256"],
                "prediction_sha256": sha256(out / "instance-predictions.npy"),
                "protocol": "Pinned upstream tiling, verticality features, model, ensembling, HDBSCAN and propagation; strict checkpoint loading and sparse-partitions-v1",
                "caveats": ["Checkpoint finetuned on all: this run is not an independent held-out test.",
                            "Frozen input was already voxelized; upstream revoxelizes after centering.",
                            "Historical finetuning preprocessing is not independently recovered."]}

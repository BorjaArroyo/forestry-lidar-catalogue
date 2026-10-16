"""Pinned checkpoint forward pass on a deterministic real Wytham context tile."""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import time
import urllib.request

WEIGHTS_URL = "https://zenodo.org/api/records/16875688/files/TreeLearn_finetuned_weights_all.pth/content"
WEIGHTS_MD5 = "577847cafec23e3a5886a680687f5afd"
MODEL = dict(kernel_size=3, channels=32, num_blocks=7, use_feats=False, use_coords=False,
             dim_coord=3, dim_feat=1, max_num_points_per_voxel=3, fixed_modules=[],
             spatial_shape=[500, 500, 1000], voxel_size=0.1)


def run(input_dir, output_dir):
    import numpy as np
    import torch
    from tree_learn.model import TreeLearn
    from driver import sha256, INPUTS
    output_dir = Path(output_dir)
    with tempfile.TemporaryDirectory(prefix="treelearn-inference-") as scratch:
        local = Path(scratch)
        data_path = local / "points.npy"
        shutil.copyfile(Path(input_dir) / "gt/wytham_val_voxel01_gt.npy", data_path)
        expected = INPUTS["gt/wytham_val_voxel01_gt.npy"]
        if sha256(data_path) != expected:
            raise ValueError("Frozen point-cloud checksum mismatch")
        data = np.load(data_path, mmap_mode="r", allow_pickle=False)
        xyz = data[:, :3]
        center = xyz.mean(0)
        selected = np.flatnonzero(np.max(np.abs(xyz[:, :2] - center[:2]), axis=1) <= 6.75)
        if not 100 <= len(selected) <= 350000:
            raise ValueError(f"Fixed 13.5 m context tile has unsupported point count: {len(selected)}")
        points = np.asarray(xyz[selected] - center, dtype=np.float32)
        if not np.isfinite(points).all(): raise ValueError("Nonfinite input coordinates")
        weights = local / "weights.pth"
        md5 = hashlib.md5(); sha = hashlib.sha256()
        with urllib.request.urlopen(WEIGHTS_URL, timeout=120) as source, weights.open("xb") as target:
            for block in iter(lambda: source.read(4 * 1024**2), b""):
                target.write(block); md5.update(block); sha.update(block)
        if weights.stat().st_size != 361611057 or md5.hexdigest() != WEIGHTS_MD5:
            raise ValueError("Provider checkpoint checksum/size mismatch")
        checkpoint_sha = sha.hexdigest()
        torch.manual_seed(0); torch.cuda.manual_seed_all(0)
        model = TreeLearn(**MODEL).cuda()
        # Strict loading forbids silently skipped or randomly initialized checkpoint tensors.
        state = torch.load(weights, map_location="cpu", weights_only=True)
        model.load_state_dict(state["net"], strict=True)
        epoch = state.get("epoch")
        del state
        model.eval()
        batch = {"coords": torch.from_numpy(points).cuda(),
                 "input_feats": torch.ones((len(points), 1), device="cuda"),
                 "batch_ids": torch.zeros(len(points), dtype=torch.long, device="cuda"), "batch_size": 1}
        torch.cuda.reset_peak_memory_stats()
        start = time.monotonic()
        with torch.no_grad():
            prediction = model(batch, return_loss=False)
        torch.cuda.synchronize()
        elapsed = time.monotonic() - start
        logits = prediction["semantic_prediction_logits"].cpu().numpy()
        offsets = prediction["offset_predictions"].cpu().numpy()
        if logits.shape != (len(points), 2) or offsets.shape != (len(points), 3): raise ValueError("Wrong output shape")
        if not np.isfinite(logits).all() or not np.isfinite(offsets).all(): raise ValueError("Nonfinite model output")
        if np.ptp(logits) == 0 or np.ptp(offsets) == 0: raise ValueError("Constant predictions")
        classes = logits.argmax(1)
        np.savez_compressed(output_dir / "pointwise-predictions.npz", source_indices=selected,
                            xyz=np.asarray(xyz[selected]), semantic_logits=logits, offsets=offsets,
                            semantic_class=classes)
        config = {"model": MODEL, "seed": 0, "precision": "float32", "center_xyz": center.tolist(),
                  "context_square_m": 13.5, "context_point_cap": 350000,
                  "feature_policy": "ones; upstream use_feats=False and use_coords=False replace input features with ones",
                  "input_policy": "Existing first-point 0.1 m voxel export, translated by full-export XYZ mean; fixed central tile, no label-based selection",
                  "configuration_source": "Pinned upstream configs/_modular/model.yaml plus pipeline spatial_shape; original finetuning configuration not provided in acquisition",
                  "weights_url": WEIGHTS_URL, "weights_md5": WEIGHTS_MD5, "weights_sha256": checkpoint_sha,
                  "input_sha256": expected, "semantic_classes": {"0": "tree", "1": "non-tree"}}
        (output_dir / "inference-config.json").write_text(json.dumps(config, indent=2) + "\n")
        return {"scope": "Real checkpoint pointwise semantic/offset inference on one context tile; no grouping, full-forest result, or benchmark score",
                "points": len(points), "checkpoint_sha256": checkpoint_sha, "checkpoint_md5": md5.hexdigest(),
                "checkpoint_epoch": int(epoch) if epoch is not None else None, "checkpoint_loading": "strict=True, weights_only=True",
                "device": torch.cuda.get_device_name(0), "forward_seconds": elapsed,
                "peak_cuda_bytes": torch.cuda.max_memory_allocated(),
                "semantic_class_counts": {str(k): int((classes == k).sum()) for k in (0, 1)},
                "output_sha256": sha256(output_dir / "pointwise-predictions.npz"),
                "caveats": ["Finetuned-on-all checkpoint: validation tile is not an independent test.",
                            "Prevoxelized sample and one context tile differ from the full overlapping-tile upstream pipeline.",
                            "Checkpoint architecture matches strictly; historical training configuration is not independently recovered."]}

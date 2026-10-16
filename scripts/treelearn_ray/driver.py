"""Run audited TreeLearn workflows on an isolated Ray worker."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import traceback

COMMIT = "fd240ce7caa4c444fe3418aca454dc578bc557d4"
INPUTS = {
    "gt/wytham_val_voxel01_gt.npy": "f0405d94b303862ff82fb0472785bf0cffaa60d4bd58bec6fbb92f21e0f55883",
    "pred/wytham_val_voxel01_baseline.npy": "920ba6ced44e891c47c42cd9b275c43ff5ef252178e8d128e4e762bbe4b2f64f",
}


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024**2), b""):
            digest.update(block)
    return digest.hexdigest()


def gpu_smoke():
    import torch
    import spconv.pytorch as spconv
    from tree_learn.model.tree_learn import TreeLearn
    if not torch.cuda.is_available():
        raise RuntimeError("Ray GPU worker has no usable CUDA device")
    torch.manual_seed(0)
    torch.cuda.manual_seed_all(0)
    values = torch.arange(16, dtype=torch.float32, device="cuda").reshape(4, 4)
    product = values @ values.T
    torch.testing.assert_close(product.cpu(), values.cpu() @ values.cpu().T)
    indices = torch.tensor([[0, x, y, z] for x in range(4) for y in range(4) for z in range(4)], dtype=torch.int32, device="cuda")
    cloud = spconv.SparseConvTensor(torch.ones((64, 4), device="cuda"), indices, [4, 4, 4], 1)
    layer = spconv.SubMConv3d(4, 8, 3, padding=1, bias=False).cuda().eval()
    with torch.no_grad():
        output = layer(cloud).features
    assert output.shape == (64, 8) and torch.isfinite(output).all().item()
    model = TreeLearn().cuda()
    # Upstream train() does not return self, so eval() must not be chained.
    model.eval()
    torch.cuda.synchronize()
    return {"scope": "CUDA matrix product, sparse convolution and TreeLearn construction; no checkpoint inference",
            "device": torch.cuda.get_device_name(0), "capability": list(torch.cuda.get_device_capability(0)),
            "torch": torch.__version__, "cuda": torch.version.cuda,
            "model_parameters": sum(p.numel() for p in model.parameters())}


def evaluate_baseline(input_dir, output_dir):
    import numpy as np
    import yaml
    output_dir = Path(output_dir)
    with tempfile.TemporaryDirectory(prefix="canopy-treelearn-") as scratch:
        local = Path(scratch)
        evidence = {}
        for relative, expected in INPUTS.items():
            source = Path(input_dir) / relative
            destination = local / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            actual = sha256(destination)
            if actual != expected:
                raise ValueError(f"Input checksum mismatch: {relative}")
            values = np.load(destination, mmap_mode="r", allow_pickle=False)
            if values.shape != (3378949, 4) or values.dtype != np.float64 or not np.isfinite(values).all():
                raise ValueError(f"Unexpected input schema: {relative}")
            labels = values[:, 3]
            if not np.equal(labels, np.floor(labels)).all() or (labels < 0).any():
                raise ValueError(f"Invalid instance labels: {relative}")
            evidence[relative] = {"sha256": actual, "points": len(values),
                                  "positive_instances": int(len(np.unique(labels[labels > 0])))}
        config = {"paths": {"pred_forest_path": str(local / "pred/wytham_val_voxel01_baseline.npy"),
                             "gt_forest_path": str(local / "gt/wytham_val_voxel01_gt.npy")},
                  "thresholds": {"min_iou_for_match": 0.5, "min_precision_for_pred": 0.5, "min_recall_for_gt": 0.5},
                  "partitions": {"xy_partition": [i / 10 for i in range(11)], "z_partition": [i / 10 for i in range(11)]}}
        config_path = local / "evaluate.yaml"
        config_path.write_text(yaml.safe_dump(config))
        (output_dir / "input-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
        shutil.copyfile(config_path, output_dir / "evaluate.yaml")
        try:
            with (output_dir / "evaluator.log").open("w") as log:
                subprocess.run([sys.executable, "/opt/canopy/partition_policy.py", "--config", str(config_path), "--report", str(output_dir / "partition-policy.json")],
                               cwd="/opt/TreeLearn", stdout=log, stderr=subprocess.STDOUT, check=True, timeout=1800)
            if not (local / "pred/evaluation/evaluation_results.pt").is_file():
                raise RuntimeError("Upstream evaluator did not produce evaluation_results.pt")
        finally:
            if (local / "pred/evaluation").exists():
                shutil.copytree(local / "pred/evaluation", output_dir / "evaluation")
        return {"scope": "Upstream evaluator on voxelized Wytham connected-components baseline; not TreeLearn inference or paper reproduction",
                "inputs": evidence, "partition_policy": "sparse-partitions-v1; undefined XY/Z rows are NaN, all GT retained"}


def worker(mode, input_dir, output_dir):
    import ray
    if mode == "gpu-smoke":
        result = gpu_smoke()
    elif mode == "full-forest-inference":
        from full_forest import run
        result = run(input_dir, output_dir)
    elif mode == "checkpoint-inference":
        from inference_check import run
        result = run(input_dir, output_dir)
    else:
        result = evaluate_baseline(input_dir, output_dir)
    result.update({"host": socket.gethostname(), "ray": ray.__version__, "python": sys.version,
                   "source_commit": COMMIT, "image": os.environ.get("CANOPY_IMAGE", "unrecorded")})
    for name in ("python-packages.txt", "os-packages.txt"):
        shutil.copyfile(Path("/opt") / name, Path(output_dir) / name)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", required=True, choices=("gpu-smoke", "baseline-evaluation", "checkpoint-inference", "full-forest-inference"))
    parser.add_argument("--input-dir")
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    if args.mode != "gpu-smoke" and not args.input_dir:
        parser.error("--input-dir is required for baseline-evaluation")
    output = Path(args.output_dir)
    if not output.is_absolute():
        parser.error("--output-dir must be absolute")
    output.mkdir(parents=True, exist_ok=False)
    import ray
    try:
        ray.init(address="auto")
        task = ray.remote(num_cpus=8 if args.mode == "full-forest-inference" else 4, num_gpus=int(args.mode != "baseline-evaluation"),
                          memory=(24 if args.mode == "full-forest-inference" else (4 if args.mode == "gpu-smoke" else 12)) * 1024**3,
                          max_retries=0)(worker)
        result = ray.get(task.remote(args.mode, args.input_dir, str(output)), timeout=5400 if args.mode == "full-forest-inference" else 2400)
        result["status"] = "succeeded"
        (output / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result), flush=True)
    except BaseException:
        (output / "failure.txt").write_text(traceback.format_exc())
        raise
    finally:
        ray.shutdown()


if __name__ == "__main__":
    main()

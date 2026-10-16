"""Render an isolated RayJob; never submits work or changes the cluster."""
import argparse
import json
from pathlib import Path
import re


def render(image, name, output_dir, mode, input_dir=None, namespace="kuberay", pvc="borja-lidar"):
    if not re.fullmatch(r"[a-z0-9][a-z0-9./:_-]*@sha256:[0-9a-f]{64}", image):
        raise ValueError("Use a registry image pinned by its published SHA256 digest")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?", name):
        raise ValueError("Use a DNS label of at most 40 characters for the job name")
    if mode not in {"gpu-smoke", "baseline-evaluation", "checkpoint-inference", "full-forest-inference"}:
        raise ValueError("Unsupported job mode")
    # Arguments become a Ray shell entrypoint: quote all paths, even generated ones.
    import shlex
    root = Path("/mnt/storage/forestseg")
    out = Path(output_dir)
    if not out.is_absolute() or ".." in out.parts or not out.is_relative_to(root / "runs") or out == root / "runs":
        raise ValueError("Outputs must be a fresh subdirectory of /mnt/storage/forestseg/runs")
    args = ["python", "/opt/canopy/driver.py", "--mode", mode, "--output-dir", str(out)]
    if mode != "gpu-smoke":
        inp = Path(input_dir or "")
        if not inp.is_absolute() or ".." in inp.parts or not inp.is_relative_to(root):
            raise ValueError("Evaluation inputs must be on the mounted forestseg PVC")
        args += ["--input-dir", str(inp)]
    gpu = mode != "baseline-evaluation"
    def pod(head):
        resources = {"cpu": "2" if head else ("8" if mode == "full-forest-inference" else "4"), "memory": "4Gi" if head else ("8Gi" if mode == "gpu-smoke" else ("32Gi" if mode == "full-forest-inference" else "16Gi"))}
        if gpu and not head:
            resources["nvidia.com/gpu"] = "1"
        spec = {"automountServiceAccountToken": False,
                "securityContext": {"runAsUser": 1000, "runAsGroup": 1000},
                "containers": [{"name": "ray-head" if head else "ray-worker", "image": image,
                    "imagePullPolicy": "IfNotPresent", "resources": {"requests": resources.copy(), "limits": resources.copy()},
                    "env": [{"name": "CANOPY_IMAGE", "value": image}],
                    "volumeMounts": [{"name": "storage", "mountPath": "/mnt/storage"}, {"name": "shm", "mountPath": "/dev/shm"}]}],
                "volumes": [{"name": "storage", "persistentVolumeClaim": {"claimName": pvc}},
                            {"name": "shm", "emptyDir": {"medium": "Memory", "sizeLimit": "1Gi" if head else "2Gi"}}]}
        if head:
            spec["containers"][0]["ports"] = [{"name": "gcs-server", "containerPort": 6379},
                {"name": "dashboard", "containerPort": 8265}, {"name": "client", "containerPort": 10001}]
        else:
            spec["nodeSelector"] = {"kubernetes.io/hostname": "bluey" if gpu else "nice"}
        return {"spec": spec}
    return {"apiVersion": "ray.io/v1", "kind": "RayJob", "metadata": {"name": name, "namespace": namespace,
                "labels": {"app.kubernetes.io/part-of": "canopy", "canopy-mode": mode}},
            "spec": {"entrypoint": shlex.join(args), "shutdownAfterJobFinishes": True,
                "ttlSecondsAfterFinished": 600, "activeDeadlineSeconds": 7200 if mode == "full-forest-inference" else 3600, "backoffLimit": 0,
                "rayClusterSpec": {"rayVersion": "2.55.1", "enableInTreeAutoscaling": False,
                    "headGroupSpec": {"serviceType": "ClusterIP", "rayStartParams": {"dashboard-host": "0.0.0.0", "num-cpus": "0", "num-gpus": "0", "object-store-memory": "536870912"}, "template": pod(True)},
                    "workerGroupSpecs": [{"groupName": "gpu" if gpu else "cpu", "replicas": 1, "minReplicas": 1, "maxReplicas": 1,
                        "rayStartParams": {"num-cpus": "8" if mode == "full-forest-inference" else "4", "num-gpus": "1" if gpu else "0", "object-store-memory": "1073741824"}, "template": pod(False)}]}}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--mode", required=True, choices=("gpu-smoke", "baseline-evaluation", "checkpoint-inference", "full-forest-inference"))
    parser.add_argument("--input-dir")
    args = parser.parse_args()
    print(json.dumps(render(args.image, args.name, args.output_dir, args.mode, args.input_dir), indent=2))


if __name__ == "__main__":
    main()

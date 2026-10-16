"""Sparse-instance policy v1: preserve GT rows; undefined partition metrics are NaN."""
import json
from pathlib import Path
import numpy as np


def partition_wrapper(original, axis, report):
    def evaluate(preds, labels, gts, matches, coords, intervals, gt_map, pred_map):
        eligible = []
        excluded = []
        for i, gt in enumerate(gts):
            points = coords[labels == gt]
            reason = None
            if len(points) < 5:
                reason = "fewer_than_five_points"
            else:
                if axis == "xy":
                    low = points[points[:, 2] <= points[:, 2].min() + 0.30]
                    distance = np.linalg.norm(points[:, :2] - low[:, :2].mean(0), axis=1)
                    scale = np.sort(distance)[-5]
                else:
                    scale = np.sort(points[:, 2])[-5] - points[:, 2].min()
                if not np.isfinite(scale) or scale <= 0:
                    reason = "nonpositive_or_nonfinite_normalization"
            if reason:
                excluded.append({"instance_label": int(gt_map[gt]), "points": len(points), "reason": reason})
            else:
                eligible.append(i)
        eligible = np.asarray(eligible, dtype=int)
        result = original(preds, labels, np.asarray(gts)[eligible], np.asarray(matches)[eligible], coords, intervals, gt_map, pred_map)
        # Preserve every GT row and its matching identity, including undefined partitions.
        result = result.set_index("instance_label").reindex([gt_map[g] for g in gts])
        result["instance_pred"] = [pred_map[p] for p in matches]
        result = result.reset_index()
        report[axis] = {"total_gt": len(gts), "eligible_gt": len(eligible), "undefined_gt": excluded}
        return result
    return evaluate


def install(report):
    import tree_learn.util.eval as upstream
    upstream.evaluate_xy_partition = partition_wrapper(upstream.evaluate_xy_partition, "xy", report)
    upstream.evaluate_z_partition = partition_wrapper(upstream.evaluate_z_partition, "z", report)


if __name__ == "__main__":
    import argparse
    import runpy
    import sys
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    report = {"policy": "sparse-partitions-v1", "scope": "Only XY/Z partition applicability; all GT, detection and whole-instance metrics retained"}
    install(report)
    sys.argv = ["evaluate.py", "--config", args.config]
    try:
        runpy.run_path("/opt/TreeLearn/tools/evaluation/evaluate.py", run_name="__main__")
    finally:
        Path(args.report).write_text(json.dumps(report, indent=2) + "\n")

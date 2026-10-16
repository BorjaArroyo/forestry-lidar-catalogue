import unittest
import numpy as np
import pandas as pd
from partition_policy import partition_wrapper
import tree_learn.util.eval as upstream


class PolicyTest(unittest.TestCase):
    def test_dense_matches_upstream_and_small_rows_remain(self):
        coords = np.asarray([[i, i % 3, i] for i in range(12)] + [[20, 0, 0], [21, 0, 1]], dtype=float)
        labels = np.array([0] * 12 + [1] * 2)
        mapping = {0: 10, 1: 11}
        for axis, original in (("xy", upstream.evaluate_xy_partition), ("z", upstream.evaluate_z_partition)):
            report = {}
            wrapped = partition_wrapper(original, axis, report)
            args = (labels, labels, np.array([0]), np.array([0]), coords, [0, .5, 1], mapping, mapping)
            pd.testing.assert_frame_equal(wrapped(*args), original(*args), check_like=True, check_dtype=False)
            result = wrapped(labels, labels, np.array([0, 1]), np.array([0, 1]), coords, [0, .5, 1], mapping, mapping)
            self.assertEqual(result.instance_label.tolist(), [10, 11])
            self.assertTrue(result.iloc[1].filter(regex="^(prec|rec|iou)_").isna().all())
            self.assertEqual(report[axis]["undefined_gt"][0]["points"], 2)

    def test_degenerate_scale_is_explicit(self):
        coords = np.zeros((6, 3)); labels = np.zeros(6, dtype=int)
        for axis, original in (("xy", upstream.evaluate_xy_partition), ("z", upstream.evaluate_z_partition)):
            report = {}
            result = partition_wrapper(original, axis, report)(labels, labels, [0], [0], coords, [0, 1], {0: 1}, {0: 1})
            self.assertEqual(len(result), 1)
            self.assertEqual(report[axis]["eligible_gt"], 0)
            self.assertTrue(result.filter(regex="^(prec|rec|iou)_").isna().all().all())


if __name__ == "__main__": unittest.main()

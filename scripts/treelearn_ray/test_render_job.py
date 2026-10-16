"""Check resource isolation and rejection of mutable or unsafe job inputs."""
import unittest
from render_job import render

IMAGE = "ghcr.io/borjaarroyo/canopy-treelearn-ray@sha256:" + "a" * 64
OUT = "/mnt/storage/forestseg/runs/canopy-treelearn/test"
IN = "/mnt/storage/forestseg/runs/canopy-treelearn/inputs"


class JobTest(unittest.TestCase):
    def test_separate_gpu_and_cpu_workers(self):
        for mode, needs_gpu in (("gpu-smoke", True), ("baseline-evaluation", False), ("checkpoint-inference", True), ("full-forest-inference", True)):
            job = render(IMAGE, "canopy-test", OUT, mode, IN)
            spec = job["spec"]
            self.assertTrue(spec["shutdownAfterJobFinishes"])
            self.assertEqual(spec["backoffLimit"], 0)
            self.assertNotIn("clusterSelector", spec)
            cluster = spec["rayClusterSpec"]
            head = cluster["headGroupSpec"]["template"]["spec"]
            worker = cluster["workerGroupSpecs"][0]["template"]["spec"]
            self.assertFalse(cluster["enableInTreeAutoscaling"])
            self.assertEqual(cluster["workerGroupSpecs"][0]["maxReplicas"], 1)
            self.assertNotIn("fsGroup", head["securityContext"])
            for pod in (head, worker):
                self.assertFalse(pod["automountServiceAccountToken"])
                self.assertEqual(pod["containers"][0]["image"], IMAGE)
            if mode == "checkpoint-inference":
                self.assertEqual(worker["containers"][0]["resources"]["limits"]["memory"], "16Gi")
                self.assertIn("--input-dir", spec["entrypoint"])
            if mode == "full-forest-inference":
                self.assertEqual(worker["containers"][0]["resources"]["limits"]["memory"], "32Gi")
                self.assertEqual(worker["containers"][0]["resources"]["limits"]["cpu"], "8")
                self.assertEqual(spec["activeDeadlineSeconds"], 7200)
            self.assertNotIn("nvidia.com/gpu", head["containers"][0]["resources"]["limits"])
            self.assertEqual("nvidia.com/gpu" in worker["containers"][0]["resources"]["limits"], needs_gpu)

    def test_reject_mutable_image_and_unsafe_paths(self):
        for image, name, out, mode, inp in (
            ("image:latest", "test", OUT, "gpu-smoke", None),
            (IMAGE, "bad;name", OUT, "gpu-smoke", None),
            (IMAGE, "test", "/tmp/output", "gpu-smoke", None),
            (IMAGE, "test", "/mnt/storage/forestseg/runs/../data", "gpu-smoke", None),
            (IMAGE, "test", "/mnt/storage/forestseg/runs", "gpu-smoke", None),
            (IMAGE, "test", OUT, "unsupported", None),
            (IMAGE, "test", OUT, "baseline-evaluation", None),
            (IMAGE, "test", OUT, "baseline-evaluation", "/tmp/input"),
        ):
            with self.subTest(image=image, out=out, mode=mode, inp=inp):
                with self.assertRaises(ValueError):
                    render(image, name, out, mode, inp)

    def test_shell_arguments_are_quoted(self):
        import shlex
        job = render(IMAGE, "test", OUT + " space; touch x", "baseline-evaluation", IN + " space")
        args = shlex.split(job["spec"]["entrypoint"])
        self.assertEqual(args[args.index("--output-dir") + 1], OUT + " space; touch x")
        self.assertEqual(args[args.index("--input-dir") + 1], IN + " space")


if __name__ == "__main__":
    unittest.main()

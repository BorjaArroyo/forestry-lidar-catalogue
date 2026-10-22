"""Frozen execution plans reject changed semantics, coverage and runtime pins."""

import copy
import hashlib
import json
from pathlib import Path
import unittest
import jsonschema

from canopy import dataset_plan
from canopy.knowledge_model import load
from canopy.task_plan import fingerprint

ROOT = Path(__file__).resolve().parents[1]


class DatasetPlans(unittest.TestCase):
    def setUp(self):
        self.model = load()
        path = ROOT / "scripts/for_instance/source-lock.json"
        self.source = json.loads(path.read_text())
        self.dev = next(
            p
            for p in self.source["plots"]
            if "/RMIT/" in p["path"] and p["published_split"] == "dev"
        )
        self.test = next(
            p
            for p in self.source["plots"]
            if "/RMIT/" in p["path"] and p["published_split"] == "test"
        )
        self.pins = dict(
            source_lock_path="scripts/for_instance/source-lock.json",
            source_lock_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            runtime_lock_sha256="a" * 64,
        )

    def resolve(self, **overrides):
        args = dict(use="training", variables=None, subsets=[[self.dev["path"]]], **self.pins)
        args.update(overrides)
        return dataset_plan.resolve(self.model, self.source, **args)

    def check(self, plan, **pins):
        return dataset_plan.check(self.model, self.source, plan, **(self.pins | pins))

    def test_deterministic_exact_selection_and_overlap_accounting(self):
        plan = self.resolve(
            use="inference", subsets=[[self.test["path"], self.dev["path"]], [self.dev["path"]]]
        )
        self.assertEqual(
            plan,
            self.resolve(
                use="inference", subsets=[[self.dev["path"], self.test["path"]], [self.dev["path"]]]
            ),
        )
        self.assertEqual(self.check(plan), plan)
        self.assertEqual(plan["totals"]["overlapping_selections"], 1)
        self.assertEqual(plan["totals"]["points"], self.dev["points"] + self.test["points"])
        self.assertEqual(
            plan["totals"]["source_las_bytes"], self.dev["size_bytes"] + self.test["size_bytes"]
        )
        self.assertGreater(
            plan["totals"]["estimated_browser_storage_bytes"], plan["totals"]["source_las_bytes"]
        )
        self.assertEqual(plan["output"]["partitions"], ["dev", "test"])
        self.assertIn("reflectance", plan["task_plan"]["omitted"])
        unsigned = {key: value for key, value in plan.items() if key != "plan_sha256"}
        self.assertEqual(plan["plan_sha256"], fingerprint(unsigned))

    def test_unknown_duplicate_empty_or_excluded_paths_fail_closed(self):
        for subsets in [
            [],
            [[]],
            [["unreviewed.las"]],
            [[self.dev["path"]] * 2],
            [[self.test["path"]]],
            [None],
            [[1]],
            [[self.dev["path"]]] * 51,
        ]:
            with self.subTest(subsets=subsets), self.assertRaises(ValueError):
                self.resolve(subsets=subsets)
        with self.assertRaises(ValueError):
            self.resolve(variables={"reflectance": "required"})

    def test_any_modified_plan_field_or_pin_is_rejected_even_if_rehashed(self):
        original = self.resolve()
        for edit in [
            lambda p: p["totals"].update(points=1),
            lambda p: p["plots"][0].update(sha256="b" * 64),
            lambda p: p["task_plan"]["variables"].update(instance_reference="off"),
            lambda p: p["output"].update(partitions=["train"]),
            lambda p: p["intake"].update(runtime_lock_sha256="b" * 64),
        ]:
            plan = copy.deepcopy(original)
            edit(plan)
            plan["plan_sha256"] = fingerprint({k: v for k, v in plan.items() if k != "plan_sha256"})
            with self.assertRaises(ValueError):
                self.check(plan)
        for key in self.pins:
            with self.assertRaises(ValueError):
                self.check(original, **{key: "b" * 64})

    def test_changed_task_or_source_membership_rejects_stale_plan(self):
        plan = self.resolve()
        self.source["plots"][self.source["plots"].index(self.dev)]["points"] += 1
        with self.assertRaises(ValueError):
            self.check(plan)
        self.source["plots"][self.source["plots"].index(self.dev)]["points"] -= 1
        self.model["nodes"]["task:instances"]["data"]["requirements"]["uses"]["training"][
            "allowed_partitions"
        ] = ["test"]
        with self.assertRaises(ValueError):
            self.check(plan)

    def test_unknown_versions_extra_fields_and_invalid_estimates_are_rejected(self):
        for edit in [
            lambda p: p.update(schema_version="future"),
            lambda p: p.update(extra=True),
            lambda p: p["intake"].update(kind="unreviewed"),
            lambda p: p["totals"].update(estimated_browser_storage_bytes=-1),
        ]:
            plan = self.resolve()
            edit(plan)
            with self.assertRaises(jsonschema.ValidationError):
                self.check(plan)

    def test_prepared_coverage_must_match_every_selected_scene_and_source(self):
        plan = self.resolve()
        manifest = dict(
            source={"record_id": 8287792},
            pipeline=plan["task_plan"]["pipeline_ref"].removeprefix("pipeline:"),
            scenes=[{k: self.dev[k] for k in dataset_plan.PLOT_FIELDS if k != "size_bytes"}],
        )
        self.assertEqual(
            dataset_plan.check_manifest(plan, manifest)["plan_sha256"], plan["plan_sha256"]
        )
        for edit in [
            lambda m: m.update(scenes=[]),
            lambda m: m["scenes"].append(copy.deepcopy(m["scenes"][0])),
            lambda m: m["scenes"][0].update(sha256="b" * 64),
            lambda m: m["scenes"][0].update(published_split="test"),
            lambda m: m["source"].update(record_id=123),
            lambda m: m.update(pipeline="unreviewed"),
        ]:
            changed = copy.deepcopy(manifest)
            edit(changed)
            with self.assertRaises(ValueError):
                dataset_plan.check_manifest(plan, changed)


class CombinedDatasetPlans(unittest.TestCase):
    def setUp(self):
        DatasetPlans.setUp(self)
        path = ROOT / "scripts/fgi_emit/source-lock.json"
        self.fgi = json.loads(path.read_text())
        self.fgi_plot = next(p for p in self.fgi["plots"] if p["path"].endswith("plot_1022.las"))
        self.contexts = {
            "8287792": dict(
                source=self.source,
                **{k: v for k, v in self.pins.items() if k != "runtime_lock_sha256"},
            ),
            "19351234": dict(
                source=self.fgi,
                source_lock_path="scripts/fgi_emit/source-lock.json",
                source_lock_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            ),
        }
        self.subsets = [
            dict(record_id="8287792", paths=[self.dev["path"]]),
            dict(record_id="19351234", paths=[self.fgi_plot["path"]]),
        ]

    def combined(self, **overrides):
        args = dict(
            use="training",
            variables={"reflectance": "optional"},
            subsets=self.subsets,
            runtime_lock_sha256="a" * 64,
        )
        args.update(overrides)
        return dataset_plan.resolve_dataset(self.model, self.contexts, **args)

    def check_combined(self, plan):
        return dataset_plan.check_dataset(
            self.model, self.contexts, plan, runtime_lock_sha256="a" * 64
        )

    def test_combined_plan_has_source_semantics_and_exact_totals(self):
        plan = self.combined()
        self.assertEqual(plan, self.combined(subsets=list(reversed(self.subsets))))
        self.assertEqual(self.check_combined(plan), plan)
        self.assertEqual(plan["schema_version"], "2.0.0")
        self.assertEqual(plan["totals"]["points"], 3150462)
        self.assertEqual(plan["totals"]["sources"], 2)
        sources = {p["task_plan"]["source_ref"]: p for p in plan["source_plans"]}
        self.assertIn("reflectance", sources["zenodo:8287792"]["task_plan"]["omitted"])
        self.assertEqual(
            sources["zenodo:19351234"]["task_plan"]["included"]["reflectance"],
            ["features", "feature_valid"],
        )
        expected = (
            2
            * sum(dataset_plan.prepared_bytes(p["task_plan"], p["plots"]) for p in sources.values())
            + self.fgi_plot["size_bytes"]
            + 64 * 1024**2
        )
        self.assertEqual(plan["totals"]["estimated_browser_storage_bytes"], expected)
        self.assertEqual(plan["output"]["partitions"], ["dev", "train"])

    def test_combined_overlap_is_only_within_source(self):
        plan = self.combined(subsets=self.subsets + [self.subsets[0]])
        self.assertEqual(plan["totals"]["overlapping_selections"], 1)
        self.assertEqual(plan["totals"]["plots"], 2)

    def test_combined_incompatibility_and_unknown_source_fail_before_execution(self):
        with self.assertRaisesRegex(ValueError, "8287792"):
            self.combined(variables={"reflectance": "required"})
        with self.assertRaises(ValueError):
            self.combined(subsets=[dict(record_id="unknown", paths=["x"])])
        with self.assertRaises(ValueError):
            self.combined(subsets=[dict(record_id="8287792", paths=[self.test["path"]])])
        with self.assertRaises(ValueError):
            self.combined(subsets=self.subsets * 26)

    def test_combined_tampering_duplicates_and_stale_source_are_rejected(self):
        original = self.combined()
        for edit in [
            lambda p: p["totals"].update(points=1),
            lambda p: p["request"]["variables"].update(reflectance="required"),
            lambda p: p["source_plans"][0]["intake"].update(source_lock_sha256="b" * 64),
            lambda p: p["source_plans"].append(copy.deepcopy(p["source_plans"][0])),
            lambda p: p["source_plans"].pop(),
            lambda p: p.update(runtime_lock_sha256="b" * 64),
        ]:
            changed = copy.deepcopy(original)
            edit(changed)
            changed["plan_sha256"] = fingerprint(
                {k: v for k, v in changed.items() if k != "plan_sha256"}
            )
            with self.assertRaises((ValueError, jsonschema.ValidationError)):
                self.check_combined(changed)
        self.contexts["19351234"]["source_lock_sha256"] = "b" * 64
        with self.assertRaises(ValueError):
            self.check_combined(original)

    def test_legacy_plan_keeps_exact_validation(self):
        plan = DatasetPlans.resolve(self)
        self.assertEqual(self.check_combined(plan), plan)
        plan["intake"]["runtime_lock_sha256"] = "b" * 64
        with self.assertRaises(ValueError):
            self.check_combined(plan)

    def test_every_planned_source_requires_exact_prepared_coverage(self):
        plan = self.combined()
        manifests = [
            dict(
                source={"record_id": int(p["task_plan"]["source_ref"].split(":")[1])},
                pipeline=p["task_plan"]["pipeline_ref"].removeprefix("pipeline:"),
                scenes=[
                    {k: row[k] for k in dataset_plan.PLOT_FIELDS if k != "size_bytes"}
                    for row in p["plots"]
                ],
            )
            for p in plan["source_plans"]
        ]
        self.assertEqual(dataset_plan.check_manifests(plan, manifests)["status"], "matched")
        for changed in [manifests[:1], manifests + [manifests[0]]]:
            with self.assertRaises(ValueError):
                dataset_plan.check_manifests(plan, changed)


if __name__ == "__main__":
    unittest.main()

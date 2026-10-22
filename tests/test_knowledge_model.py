"""Protect graph identity, references and lossless existing catalog projections."""

import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from jsonschema.exceptions import ValidationError
from canopy import knowledge_model as model

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT
sys.path.insert(0, str(ROOT / "scripts"))
from audit_fgi_measurements import measurement_counts  # noqa: E402


class KnowledgeModel(unittest.TestCase):
    def setUp(self):
        self.graph = model.load()
        self.schema = model.read_json(WEB / "knowledge-model.schema.json")

    def test_package_imports_and_legacy_cli_work_outside_the_checkout(self):
        outside = Path(tempfile.gettempdir())
        environment = os.environ.copy()
        with tempfile.TemporaryDirectory() as temporary:
            state = Path(temporary) / "service-state"
            environment["CANOPY_STATE"] = str(state)
            imported = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    "import canopy.service.app; import canopy.task_dataset",
                ],
                cwd=outside,
                env=environment,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(imported.stdout, "")
            self.assertFalse(state.exists())
            cli = subprocess.run(
                [sys.executable, str(ROOT / "scripts/knowledge_model.py")],
                cwd=outside,
                env=environment,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertIn("validated", cli.stdout)

    def rejects(self, mutate):
        mutate(self.graph)
        with self.assertRaises((ValueError, ValidationError)):
            model.validate(self.graph, self.schema)

    def test_current_content_round_trips_without_promoting_evidence(self):
        before = copy.deepcopy(self.graph)
        profiles, relationships, tasks = model.project(self.graph)
        catalog = model.read_json(WEB / "catalog.json")
        self.assertEqual(set(profiles), {d["id"] for d in catalog["datasets"]})
        self.assertEqual(relationships, catalog["mappings"])
        self.assertEqual(tasks, catalog["tasks"])
        self.assertEqual(self.graph, before)
        model.check_views()

    def test_dangling_reference_is_rejected(self):
        self.rejects(lambda g: g["edges"]["relation:tls-v2"].update(target="zenodo:999999"))

    def test_endpoint_type_is_checked_beyond_json_schema_shape(self):
        self.rejects(lambda g: g["edges"]["relation:tls-v2"].update(target="task:instances"))

    def test_missing_assessment_does_not_silently_mean_unsupported(self):
        self.rejects(lambda g: g["edges"].pop("support:8287792:instances"))

    def test_duplicate_assessment_is_rejected(self):
        self.rejects(
            lambda g: g["edges"].update(
                {"support:duplicate": copy.deepcopy(g["edges"]["support:8287792:instances"])}
            )
        )

    def test_record_identity_is_version_scoped(self):
        self.rejects(lambda g: g["nodes"]["zenodo:8287792"]["data"].update(record_id="9"))

    def test_ready_preparation_requires_declared_class_semantics(self):
        self.rejects(
            lambda g: g["nodes"]["zenodo:8287792"]["data"]["profile"].pop("class_semantics")
        )

    def test_class_semantics_codes_are_unique_and_evidence_backed(self):
        self.rejects(
            lambda g: g["nodes"]["zenodo:19351234"]["data"]["profile"]["class_semantics"][1].update(
                code="0"
            )
        )
        self.graph = model.load()
        self.rejects(
            lambda g: g["nodes"]["zenodo:16742708"]["data"]["profile"]["class_semantics"][0].update(
                evidence_ref="evidence:missing"
            )
        )

    def test_class_codes_are_source_scoped_data(self):
        def terms(record):
            profile = self.graph["nodes"][record]["data"]["profile"]
            return {entry["code"]: entry["term"] for entry in profile["class_semantics"]}

        for_v1, for_v2, fgi = (
            terms("zenodo:8287792"),
            terms("zenodo:16742708"),
            terms("zenodo:19351234"),
        )
        self.assertEqual(for_v1["1"], "low vegetation")
        self.assertEqual(for_v2["1"], "terrain")
        self.assertEqual(for_v1["2"], "terrain")
        self.assertEqual(fgi["2"], "building")
        self.assertEqual(len(for_v1), 7)
        self.assertEqual(len(fgi), 6)

    def test_evidence_must_exist_and_be_shared(self):
        evidence = next(k for k, v in self.graph["nodes"].items() if v["type"] == "evidence")
        self.rejects(lambda g: g["nodes"].pop(evidence))
        self.graph = model.load()
        self.rejects(
            lambda g: g["nodes"].update({"evidence:duplicate": copy.deepcopy(g["nodes"][evidence])})
        )

    def test_unknown_fields_and_model_versions_are_rejected(self):
        self.rejects(lambda g: g["nodes"]["zenodo:8287792"]["data"]["profile"].update(typo="value"))
        self.graph = model.load()
        self.rejects(lambda g: g.update(schema_version="9.0"))

    def test_legacy_relationship_is_not_an_executable_pipeline(self):
        self.rejects(
            lambda g: g["edges"]["relation:tls-v2"]["data"]["contract"].update(
                status="execution_ready"
            )
        )

    def test_duplicate_json_keys_cannot_replace_graph_entities_silently(self):
        with tempfile.TemporaryDirectory(dir=ROOT / "temp") as folder:
            path = Path(folder) / "duplicate.json"
            path.write_text('{"nodes":{},"nodes":{}}')
            with self.assertRaisesRegex(ValueError, "Duplicate JSON key"):
                model.read_json(path)

    def test_evidence_graph_cycles_are_allowed_without_execution_semantics(self):
        edge = copy.deepcopy(self.graph["edges"]["relation:v1-v2-lineage"])
        edge["source"], edge["target"] = edge["target"], edge["source"]
        edge["order"] = sum(
            e["type"] == "dataset_relationship" for e in self.graph["edges"].values()
        )
        self.graph["edges"]["relation:reverse-review"] = edge
        model.validate(self.graph, self.schema)

    def test_refresh_is_deterministic_and_preserves_observed_snapshot(self):
        with tempfile.TemporaryDirectory(dir=ROOT / "temp") as folder:
            folder = Path(folder)
            for name in ("knowledge-model.json", "knowledge-model.schema.json", "catalog.json"):
                shutil.copyfile(WEB / name, folder / name)
            (folder / "evidence").mkdir()
            shutil.copyfile(
                WEB / "evidence/for-instance-v1.json", folder / "evidence/for-instance-v1.json"
            )
            (folder / "scripts").mkdir()
            shutil.copyfile(
                ROOT / "scripts/harmonize_lidar.py", folder / "scripts/harmonize_lidar.py"
            )
            shutil.copytree(
                ROOT / "scripts/for_instance",
                folder / "scripts/for_instance",
                ignore=shutil.ignore_patterns("__pycache__"),
            )
            shutil.copytree(
                ROOT / "scripts/fgi_emit",
                folder / "scripts/fgi_emit",
                ignore=shutil.ignore_patterns("__pycache__"),
            )
            for source in (WEB / "evidence").glob("*.json"):
                shutil.copyfile(source, folder / "evidence" / source.name)
            before = model.read_json(folder / "catalog.json")
            model.export_views(folder)
            after = model.read_json(folder / "catalog.json")
            for key in (
                "datasets",
                "tasks",
                "mappings",
                "summary",
                "snapshot_provenance",
                "generated_at",
            ):
                self.assertEqual(before[key], after[key])
            first = (folder / "catalog.json").read_bytes()
            model.export_views(folder)
            self.assertEqual(first, (folder / "catalog.json").read_bytes())
            code = folder / "scripts/harmonize_lidar.py"
            original = code.read_bytes()
            code.write_bytes(original + b"\n# changed implementation\n")
            with self.assertRaisesRegex(ValueError, "Pinned metadata artifact changed"):
                model.check_views(folder)
            code.write_bytes(original)
            changed = model.read_json(folder / "catalog.json")
            changed["datasets"][0]["name"] = "stale view"
            (folder / "catalog.json").write_text(json.dumps(changed))
            with self.assertRaisesRegex(ValueError, "source view is stale"):
                model.check_views(folder)

    def test_for_instance_contract_is_explicit_and_not_execution_admission(self):
        nodes = self.graph["nodes"]
        native = nodes["contract:for-instance-native:1.0.0"]["data"]
        tree = next(f for f in native["fields"] if f["name"] == "treeID")
        self.assertEqual(tree["dtypes"], ["int32", "float64"])
        self.assertEqual({x["code"] for x in native["annotation_codes"]}, set(range(7)))
        pipeline = nodes["pipeline:for-instance-plot-instances:1.0.0"]["data"]
        self.assertTrue(pipeline["execution_enabled"])
        self.assertEqual(pipeline["status"], "validated")
        for operation in pipeline["transformation_refs"]:
            self.assertTrue(nodes[operation]["data"]["execution_enabled"])
        self.assertNotIn("relation:v1-v2", self.graph["edges"])

    def test_for_instance_partition_discrepancy_keeps_its_observation_scope(self):
        evidence = model.read_json(WEB / "evidence/for-instance-v1.json")
        partition = evidence["partition_review"]
        self.assertEqual(partition["csv_rows"], 82)
        self.assertEqual(partition["acquired_las_files"], 32)
        self.assertEqual(partition["matched_counts"], {"dev": 21, "test": 11})
        self.assertEqual(len(partition["unmatched_rows"]), 50)
        self.assertEqual({r["folder"] for r in partition["unmatched_rows"]}, {"NIBIO2"})
        self.assertEqual(partition["las_without_split"], [])

    def test_data_flow_requires_contract_endpoints_and_all_ports(self):
        self.rejects(
            lambda g: g["edges"]["flow:for-instance-decode-input"].update(target="task:instances")
        )
        self.graph = model.load()
        self.rejects(lambda g: g["edges"].pop("flow:for-instance-decode-output"))

    def test_pipeline_metadata_cannot_skip_contracts_or_enable_execution(self):
        key = "pipeline:for-instance-plot-instances:1.0.0"
        self.rejects(
            lambda g: g["nodes"][key]["data"]["transformation_refs"].insert(
                0, "transformation:for-instance-existing-normalization:1.0.0"
            )
        )
        self.graph = model.load()
        self.rejects(lambda g: g["nodes"][key]["data"].pop("validation_ref"))

    def test_contract_identity_tracks_the_declared_version(self):
        self.rejects(
            lambda g: g["nodes"]["contract:for-instance-native:1.0.0"]["data"].update(
                version="2.0.0"
            )
        )

    def test_ready_badge_requires_an_enabled_source_specific_pipeline(self):
        self.rejects(
            lambda g: g["nodes"]["zenodo:16742708"]["data"]["profile"]["discovery"][
                "preparation"
            ].update(status="ready")
        )
        self.graph = model.load()
        self.rejects(
            lambda g: g["nodes"]["transformation:for-instance-task-preparation:1.0.0"]["data"][
                "blockers"
            ].append("unresolved")
        )

    def test_fgi_contract_keeps_measurements_reference_and_display_distinct(self):
        contract = self.graph["nodes"]["contract:fgi-emit-native:1.0.0"]["data"]
        fields = {f["name"]: f for f in contract["fields"]}
        self.assertEqual(len(fields), 39)
        self.assertEqual(sum(f["role"] == "measurement" for f in fields.values()), 12)
        for name, sentinel in [
            ("intensity_1", 0),
            ("amplitude_1", 0),
            ("reflectance_1", -9999),
            ("deviation_1", 65535),
        ]:
            self.assertEqual(fields[name]["measurement"]["missingness"]["values"], [sentinel])
        self.assertEqual(fields["tree_index"]["role"], "reference")
        self.assertNotIn("measurement", fields["tree_index"])
        self.assertEqual(fields["red"]["role"], "display")
        self.assertEqual(fields["red"]["measurement"]["semantic_status"], "conflicting")
        self.assertEqual(fields["red"]["measurement"]["missingness"]["values"], [])
        profiles, _, _ = model.project(self.graph)
        projected = profiles["19351234"]["native_measurement_contracts"][0]
        self.assertEqual(projected["fields"], contract["fields"])
        self.assertEqual([c["wavelength_nm"] for c in projected["channels"]], [1550, 905, 532])
        self.assertEqual(profiles["19351234"]["discovery"]["preparation"]["status"], "ready")

    def test_measurement_channels_are_typed_evidenced_and_source_scoped(self):
        channel = "channel:fgi-emit-scanner-1:1.0.0"
        self.rejects(lambda g: g["nodes"].pop(channel))
        self.graph = model.load()
        self.rejects(lambda g: g["nodes"][channel]["data"].update(source_ref="zenodo:8287792"))
        self.graph = model.load()
        self.rejects(
            lambda g: g["nodes"][channel]["data"]["calibration"].update(status="validated")
        )

    def test_measurement_metadata_cannot_invent_units_missingness_or_alignment(self):
        key = "contract:fgi-emit-native:1.0.0"

        def field(g, name):
            return next(f for f in g["nodes"][key]["data"]["fields"] if f["name"] == name)[
                "measurement"
            ]

        self.rejects(lambda g: field(g, "reflectance_1")["unit"].update(symbol="dB"))
        self.graph = model.load()
        self.rejects(lambda g: field(g, "red")["missingness"].update(values=[0]))
        self.graph = model.load()
        self.rejects(lambda g: field(g, "reflectance_1")["association"].update(status="validated"))

    def test_finite_sentinels_are_missing_but_numeric_zero_is_quantity_specific(self):
        result = measurement_counts([0, 1, -9999, float("nan"), float("inf")], -9999)
        self.assertEqual(
            result,
            {"sampled_points": 5, "sentinel_count": 1, "nonfinite_count": 2, "valid_count": 2},
        )
        self.assertEqual(measurement_counts([0, 1], 0)["valid_count"], 1)
        self.assertEqual(measurement_counts([0, 1], -9999)["valid_count"], 2)

    def test_feature_requirements_block_unverified_measurements_without_admitting_a_pipeline(self):
        nodes = self.graph["nodes"]
        requirement = {
            "field": "reflectance_1",
            "purpose": "feature",
            "unit": None,
            "missing_policy": "mask",
            "calibration": "not_required",
            "association": "not_required",
        }
        description = {
            "input_ref": "contract:fgi-emit-native:1.0.0",
            "execution_enabled": True,
            "input_requirements": [requirement],
        }
        # This helper checks declarations only; it grants no execution admission.
        model.validate_input_requirements(description, nodes)
        for change in [
            {"field": "absent"},
            {"unit": "dB"},
            {"missing_policy": "preserve"},
            {"calibration": "validated"},
            {"association": "validated"},
            {"field": "red"},
        ]:
            with self.subTest(change=change):
                changed = copy.deepcopy(description)
                changed["input_requirements"][0].update(change)
                with self.assertRaises(ValueError):
                    model.validate_input_requirements(changed, nodes)
        draft = copy.deepcopy(description)
        draft["execution_enabled"] = False
        draft["input_requirements"][0]["calibration"] = "validated"
        model.validate_input_requirements(draft, nodes)

    def test_input_requirements_reject_dangling_fields_and_duplicates(self):
        key = "pipeline:for-instance-plot-instances:1.0.0"
        self.rejects(
            lambda g: g["nodes"][key]["data"]["input_requirements"][0].update(field="reflectance_1")
        )
        self.graph = model.load()
        self.rejects(
            lambda g: g["nodes"][key]["data"]["input_requirements"].append(
                copy.deepcopy(g["nodes"][key]["data"]["input_requirements"][0])
            )
        )

    def test_fgi_evidence_retains_its_bounded_observation_scope(self):
        audit = model.read_json(WEB / "evidence/fgi-emit-measurements.json")
        self.assertEqual(len(audit["plots"]), 19)
        self.assertEqual(audit["sampled_points"], 190000)
        self.assertEqual(audit["header_points"], 60793586)
        self.assertTrue(audit["metadata_asset"]["integrity_verified"])
        self.assertTrue(
            all(
                p["sample"]["points"] == 10000
                and not p["payload_sha256_reverified"]
                and p["crs"] is None
                for p in audit["plots"]
            )
        )
        self.assertEqual(sum(p["split"] == "train" for p in audit["plots"]), 13)
        self.assertEqual(sum(p["split"] == "test" for p in audit["plots"]), 6)


if __name__ == "__main__":
    (ROOT / "temp").mkdir(exist_ok=True)
    unittest.main()

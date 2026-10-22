"""Shared graph-node identity and ordering rules."""

from .pipelines import validate_pipeline_node


def ordered(values, label):
    orders = sorted(values)
    if orders != list(range(len(orders))):
        raise ValueError(f"{label}: order must be unique and contiguous from zero")


def require_node(nodes, key, expected):
    if key not in nodes or nodes[key]["type"] != expected:
        raise ValueError(f"{key}: expected an existing {expected} node")


def require_pinned_validation(nodes, key, evidence_refs):
    require_node(nodes, key, "evidence")
    if key not in evidence_refs or not {"local", "sha256"} <= set(nodes[key]["data"]):
        raise ValueError("Validated measurements require pinned local validation evidence")




def validate_nodes(nodes):
    def require(key, expected):
        require_node(nodes, key, expected)

    sources, tasks, locators = set(), set(), set()
    for key, node in nodes.items():
        data = node["data"]
        if node["type"] == "source_release":
            if key != "zenodo:" + data["record_id"]:
                raise ValueError("Source identity must match its version-specific Zenodo record")
            sources.add(key)
            semantics = data["profile"].get("class_semantics")
            if semantics:
                codes = [entry["code"] for entry in semantics]
                if len(codes) != len(set(codes)):
                    raise ValueError(f"{key}: class semantics codes must be unique within a source")
                for entry in semantics:
                    require(entry["evidence_ref"], "evidence")
            for fact in data["profile"]["review"]["source_facts"]:
                require(fact["evidence_ref"], "evidence")
                if "url" not in nodes[fact["evidence_ref"]]["data"]:
                    raise ValueError("Provider facts require a public evidence URL")
        elif node["type"] == "task":
            if key != "task:" + data["key"]:
                raise ValueError("Task identity does not match its key")
            tasks.add(key)
        elif node["type"] == "evidence":
            if not key.startswith("evidence:"):
                raise ValueError("Evidence identity must use the evidence namespace")
            locator = tuple(data.items())
            if locator in locators:
                raise ValueError("Evidence resources must be shared by reference, not duplicated")
            locators.add(locator)
        else:
            namespaces = {
                "data_contract": "contract:",
                "transformation": "transformation:",
                "pipeline_spec": "pipeline:",
                "coordinate_frame": "coordinates:",
                "measurement_channel": "channel:",
            }
            if not key.startswith(namespaces[node["type"]]) or not key.endswith(
                ":" + data["version"]
            ):
                raise ValueError(
                    "Contract, transformation and pipeline identity must include their version"
                )
            for evidence in data["evidence_refs"]:
                require(evidence, "evidence")
            if data.get("execution_enabled"):
                require(data.get("validation_ref"), "evidence")
                validation = nodes[data["validation_ref"]]["data"]
                if (
                    data["status"] != "validated"
                    or data["validation_ref"] not in data["evidence_refs"]
                    or not {"local", "sha256"} <= set(validation)
                ):
                    raise ValueError(
                        "Enabled execution requires validated status and pinned local validation evidence"
                    )
                if node["type"] == "transformation" and (
                    not data["implementation"]
                    or data["blockers"]
                    or any(r["status"] == "unresolved" for r in data["rules"])
                ):
                    raise ValueError(
                        "Enabled transformation requires implementation and resolved blockers/rules"
                    )
            if node["type"] == "data_contract":
                require(data["coordinate_ref"], "coordinate_frame")
                fields = [field["name"] for field in data["fields"]]
                if len(fields) != len(set(fields)):
                    raise ValueError("Contract field names must be unique")
                for field in data["fields"]:
                    measurement = field.get("measurement")
                    if not measurement:
                        continue
                    if field.get("role") not in {"measurement", "display"}:
                        raise ValueError(
                            "Measurement descriptors require a measurement or display role"
                        )
                    if (field["role"] == "display") != (measurement["quantity"] == "pseudocolor"):
                        raise ValueError("Pseudo colors must remain display attributes")
                    require(measurement["channel_ref"], "measurement_channel")
                    for evidence in measurement["evidence_refs"]:
                        require(evidence, "evidence")
                    unit, missing, association = (
                        measurement[k] for k in ("unit", "missingness", "association")
                    )
                    if (unit["status"] == "unknown") != (unit["symbol"] is None):
                        raise ValueError("Unknown measurement units must remain null")
                    if (missing["status"] == "documented_sentinel") != bool(missing["values"]):
                        raise ValueError(
                            "Missingness must distinguish documented sentinels from undocumented values"
                        )
                    if (association["method"] == "nearest_neighbor") != (
                        association["max_distance_m"] is not None
                    ):
                        raise ValueError(
                            "Nearest-neighbor association requires a positive distance bound"
                        )
                    if (association["method"] == "not_documented") != (
                        association["status"] == "not_documented"
                    ):
                        raise ValueError(
                            "Association provenance must distinguish unknown and reported methods"
                        )
                    if association["status"] == "validated":
                        require_pinned_validation(
                            nodes, association.get("validation_ref"), measurement["evidence_refs"]
                        )
            elif node["type"] == "measurement_channel":
                require(data["source_ref"], "source_release")
                if data["calibration"]["status"] == "validated":
                    require_pinned_validation(
                        nodes, data["calibration"].get("validation_ref"), data["evidence_refs"]
                    )
            elif node["type"] == "pipeline_spec":
                validate_pipeline_node(data, nodes, require)

    for source in sources:
        if nodes[source]["data"]["profile"]["discovery"]["preparation"]["status"] == "ready":
            admitted = [
                n
                for n in nodes.values()
                if n["type"] == "pipeline_spec"
                and n["data"]["source_ref"] == source
                and n["data"]["task_ref"] == "task:instances"
                and n["data"]["execution_enabled"]
            ]
            if len(admitted) != 1:
                raise ValueError(
                    "A ready source requires exactly one enabled instance pipeline for its pinned release"
                )
            if not nodes[source]["data"]["profile"].get("class_semantics"):
                raise ValueError(
                    "A ready preparation must declare its native class semantics as source-scoped data"
                )
    if not sources or not tasks:
        raise ValueError("The graph requires sources and tasks")
    ordered([nodes[t]["data"]["order"] for t in tasks], "Tasks")
    return sources, tasks

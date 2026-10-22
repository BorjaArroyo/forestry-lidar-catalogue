"""Lossless catalog projections from canonical graph references."""

import copy


def source_task_context(model, source_ref, task_ref="task:instances"):
    """Project reviewed outputs separately from native spectral descriptions."""
    nodes = model["nodes"]
    native = [
        nodes[e["target"]]["data"]
        for e in model["edges"].values()
        if e["type"] == "data_flow" and e["role"] == "describes" and e["source"] == source_ref
    ]
    spectra = []
    for contract in native:
        for field in contract["fields"]:
            m = field.get("measurement")
            if (
                field.get("role") == "measurement"
                and m
                and m["quantity"] == "reflectance"
                and m["semantic_status"] == "documented"
            ):
                channel = nodes[m["channel_ref"]]["data"]
                spectra.append(
                    dict(
                        field=field["name"],
                        channel_ref=m["channel_ref"],
                        wavelength_nm=channel["wavelength_nm"],
                    )
                )
    pipelines = [
        {
            "id": key,
            "output_ref": n["data"]["output_ref"],
            "variable_outputs": copy.deepcopy(n["data"].get("variable_outputs", {})),
        }
        for key, n in nodes.items()
        if n["type"] == "pipeline_spec"
        and n["data"]["source_ref"] == source_ref
        and n["data"]["task_ref"] == task_ref
        and n["data"]["execution_enabled"]
    ]
    return dict(
        pipelines=pipelines,
        native_reflectance=spectra,
        note="Native availability does not admit feature extraction, calibration or a preparation pipeline.",
    )


def project(model):
    """Resolve graph references without modifying the canonical graph."""
    nodes = model["nodes"]
    task_nodes = sorted(
        (n["data"] for n in nodes.values() if n["type"] == "task"), key=lambda t: t["order"]
    )
    tasks = [
        {**{k: v for k, v in task.items() if k not in {"key", "order"}}, "id": task["key"]}
        for task in task_nodes
    ]

    def evidence(item):
        result = copy.deepcopy(item)
        result.update(nodes[result.pop("evidence_ref")]["data"])
        return result

    profiles = {}
    for key, node in nodes.items():
        if node["type"] != "source_release":
            continue
        profile = copy.deepcopy(node["data"]["profile"])
        supports = {
            nodes[e["target"]]["data"]["key"]: e["data"]
            for e in model["edges"].values()
            if e["type"] == "task_support" and e["source"] == key
        }
        for field, order in (("tasks", "listing_order"), ("conditional", "conditional_order")):
            profile[field] = [
                task
                for task, data in sorted(
                    supports.items(),
                    key=lambda item: item[1][order] if item[1][order] is not None else -1,
                )
                if data[order] is not None
            ]
        profile["source_task_support"] = {
            task["key"]: {k: supports[task["key"]][k] for k in ("status", "reason")}
            for task in task_nodes
        }
        profile["review"]["source_facts"] = [
            evidence(fact) for fact in profile["review"]["source_facts"]
        ]
        contracts = []
        for edge in model["edges"].values():
            if edge["type"] != "data_flow" or edge["role"] != "describes" or edge["source"] != key:
                continue
            contract = nodes[edge["target"]]["data"]
            measurements = [f for f in contract["fields"] if "measurement" in f]
            if not measurements:
                continue
            channels = sorted({f["measurement"]["channel_ref"] for f in measurements})
            contracts.append(
                {
                    "id": edge["target"],
                    **copy.deepcopy(contract),
                    "channels": [
                        {"id": channel, **copy.deepcopy(nodes[channel]["data"])}
                        for channel in channels
                    ],
                }
            )
        if contracts:
            profile["native_measurement_contracts"] = contracts
        profiles[key.removeprefix("zenodo:").replace(":", "-")] = profile
    relationships = []
    for key, edge in sorted(model["edges"].items(), key=lambda item: item[1].get("order", -1)):
        if edge["type"] != "dataset_relationship":
            continue
        relationship = copy.deepcopy(edge["data"])
        relationship.update(
            id=key.removeprefix("relation:"),
            source=nodes[edge["source"]]["data"]["record_id"],
            target=nodes[edge["target"]]["data"]["record_id"],
            tasks=[nodes[t]["data"]["key"] for t in edge["task_refs"]],
        )
        relationship["evidence"] = [evidence(item) for item in relationship["evidence"]]
        relationships.append(relationship)
    for task in tasks:
        if "requirements" in task:
            task["preparation_sources"] = {
                key.removeprefix("zenodo:").replace(":", "-"): source_task_context(
                    model, key, "task:" + task["id"]
                )
                for key, node in nodes.items()
                if node["type"] == "source_release"
            }
    return profiles, relationships, tasks

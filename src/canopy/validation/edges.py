"""Graph relationships, assessments, and pipeline connectivity rules."""

from .nodes import ordered, require_node
from .pipelines import validate_pipeline_graph


def validate_edges(nodes, edges, sources, tasks):
    """Validate edges in their historical order to preserve first-error behavior."""

    support = {}
    relationship_orders = []
    flows = set()
    ports = {}
    for key, edge in edges.items():
        if edge["type"] == "data_flow":
            endpoint_types = {
                "describes": ("source_release", "data_contract"),
                "consumes": ("transformation", "data_contract"),
                "produces": ("transformation", "data_contract"),
                "designed_for": ("data_contract", "task"),
            }
            if not key.startswith("flow:"):
                raise ValueError("Data-flow identity must use the flow namespace")
            source_type, target_type = endpoint_types[edge["role"]]
            require_node(nodes, edge["source"], source_type)
            require_node(nodes, edge["target"], target_type)
            link = edge["role"], edge["source"], edge["target"]
            if link in flows:
                raise ValueError("Duplicate data-flow relationship")
            flows.add(link)
            if edge["role"] in {"consumes", "produces"}:
                ports.setdefault(edge["source"], {}).setdefault(edge["role"], set()).add(
                    edge["target"]
                )
            continue
        require_node(nodes, edge["source"], "source_release")
        if edge["type"] == "task_support":
            require_node(nodes, edge["target"], "task")
            pair = edge["source"], edge["target"]
            if pair in support:
                raise ValueError("Duplicate source-task assessment")
            support[pair] = edge["data"]
            if not key.startswith("support:"):
                raise ValueError("Task support identity must use the support namespace")
            if (
                edge["data"]["conditional_order"] is not None
                and edge["data"]["listing_order"] is None
            ):
                raise ValueError("A conditional task must also be listed")
        else:
            require_node(nodes, edge["target"], "source_release")
            if not key.startswith("relation:"):
                raise ValueError("Relationship identity must use the relation namespace")
            for task in edge["task_refs"]:
                require_node(nodes, task, "task")
            for evidence in edge["data"]["evidence"]:
                require_node(nodes, evidence["evidence_ref"], "evidence")
            relationship_orders.append(edge["order"])
    for role, source, target in flows:
        if role != "describes":
            continue
        for field in nodes[target]["data"]["fields"]:
            if (
                "measurement" in field
                and nodes[field["measurement"]["channel_ref"]]["data"]["source_ref"] != source
            ):
                raise ValueError("Measurement channels must belong to the described source release")
    if set(support) != {(source, task) for source in sources for task in tasks}:
        raise ValueError(
            "Every source-task pair requires an explicit assessment, including unknowns"
        )
    for source in sources:
        for field in ("listing_order", "conditional_order"):
            ordered(
                [
                    value[field]
                    for (s, _), value in support.items()
                    if s == source and value[field] is not None
                ],
                source + ":" + field,
            )
    ordered(relationship_orders, "Relationships")
    validate_pipeline_graph(nodes, flows, ports)

"""Pipeline composition and task-input compatibility rules."""

from .tasks import validate_input_requirements


def validate_pipeline_node(data, nodes, require):
    """Validate a pipeline node during the model's original node traversal."""
    for field, kind in (
        ("source_ref", "source_release"),
        ("task_ref", "task"),
        ("input_ref", "data_contract"),
        ("output_ref", "data_contract"),
    ):
        require(data[field], kind)
    validate_input_requirements(data, nodes)
    for operation in data["transformation_refs"]:
        require(operation, "transformation")
        if data["execution_enabled"] and not nodes[operation]["data"]["execution_enabled"]:
            raise ValueError("Enabled pipeline cannot contain a disabled transformation")


def validate_pipeline_graph(nodes, flows, ports):
    """Check source and task bindings and ordered transformation composition."""
    for key, node in nodes.items():
        if node["type"] == "transformation":
            if set(ports.get(key, {})) != {"consumes", "produces"}:
                raise ValueError(
                    "Every described transformation needs explicit input and output contracts"
                )
        elif node["type"] == "pipeline_spec":
            data = node["data"]
            if ("describes", data["source_ref"], data["input_ref"]) not in flows:
                raise ValueError("Pipeline source does not describe its input contract")
            if ("designed_for", data["output_ref"], data["task_ref"]) not in flows:
                raise ValueError("Pipeline output is not associated with its intended task")
            available = {data["input_ref"]}
            for operation in data["transformation_refs"]:
                port = ports.get(operation, {})
                if not port.get("consumes") or not port["consumes"] <= available:
                    raise ValueError("Pipeline metadata has disconnected or out-of-order contracts")
                available.update(port.get("produces", set()))
            if data["output_ref"] not in available:
                raise ValueError("Pipeline metadata does not reach its declared output")

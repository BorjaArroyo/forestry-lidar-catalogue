"""Task input and output requirement rules."""


def validate_input_requirements(data, nodes):
    """Check declared inputs; metadata checks do not validate a running consumer."""
    fields = {f["name"]: f for f in nodes[data["input_ref"]]["data"]["fields"]}
    seen = set()
    for requirement in data.get("input_requirements", []):
        name = requirement["field"]
        identity = name, requirement["purpose"]
        if name not in fields or identity in seen:
            raise ValueError(
                "Input requirements must name existing fields without duplicate purposes"
            )
        seen.add(identity)
        field = fields[name]
        measurement = field.get("measurement")
        if requirement["purpose"] != "feature":
            if (
                requirement["calibration"] != "not_required"
                or requirement["association"] != "not_required"
                or requirement["unit"] is not None
            ):
                raise ValueError("Measurement constraints require a feature input")
            continue
        if not measurement or field.get("role") != "measurement":
            raise ValueError("Feature inputs require a typed measurement field")
        if not data["execution_enabled"]:
            continue
        if measurement["semantic_status"] != "documented":
            raise ValueError("Enabled feature input has unresolved measurement semantics")
        if requirement["unit"] is not None and (
            measurement["unit"]["status"] != "documented"
            or measurement["unit"]["symbol"] != requirement["unit"]
        ):
            raise ValueError("Feature unit is unknown or incompatible")
        missing = measurement["missingness"]
        if missing["status"] == "not_documented" or requirement["missing_policy"] == "preserve":
            raise ValueError(
                "Enabled feature inputs require documented missingness and an explicit mask or rejection"
            )
        channel = nodes[measurement["channel_ref"]]["data"]
        if (
            requirement["calibration"] == "validated"
            and channel["calibration"]["status"] != "validated"
        ):
            raise ValueError("Required channel calibration has not been validated")
        if (
            requirement["association"] == "validated"
            and measurement["association"]["status"] != "validated"
        ):
            raise ValueError("Required channel association has not been validated")


def validate_task_requirements(nodes):
    """Validate typed task outputs against existing source pipeline contracts."""
    for key, node in nodes.items():
        if node["type"] != "task" or "requirements" not in node["data"]:
            continue
        req = node["data"]["requirements"]
        variables = {v["key"]: v for v in req["variables"]}
        if len(variables) != len(req["variables"]):
            raise ValueError("Duplicate task variable")
        if any(
            not set(use["required_variables"]) <= set(variables) for use in req["uses"].values()
        ):
            raise ValueError("Task use names an undefined variable")
        for variable in variables.values():
            measurement = variable["purpose"] == "measurement"
            if measurement != bool(variable["quantity"]) or measurement != (
                variable["minimum_channels"] > 0
            ):
                raise ValueError("Spectral constraints require a measurement variable")
            fields = variable["output_fields"]
            if len({f["name"] for f in fields}) != len(fields):
                raise ValueError("Duplicate variable output field")
        for pipeline in (
            n["data"]
            for n in nodes.values()
            if n["type"] == "pipeline_spec" and n["data"]["task_ref"] == key
        ):
            bindings = pipeline.get("variable_outputs", {})
            if pipeline["execution_enabled"] and not bindings:
                raise ValueError("Enabled task pipeline needs explicit variable outputs")
            output = {f["name"]: f for f in nodes[pipeline["output_ref"]]["data"]["fields"]}
            for name, fields in bindings.items():
                if name not in variables:
                    raise ValueError("Pipeline binds an undefined task variable")
                expected = variables[name]["output_fields"]
                if fields != [f["name"] for f in expected]:
                    raise ValueError("Pipeline output binding differs from task variable fields")
                for field in expected:
                    actual = output.get(field["name"])
                    if (
                        not actual
                        or any(actual[k] != field[k] for k in ["dtypes", "shape"])
                        or not actual["required"]
                    ):
                        raise ValueError(
                            "Pipeline output does not meet task dtype/shape requirements"
                        )
                if variables[name]["purpose"] == "measurement":
                    native = {f["name"]: f for f in nodes[pipeline["input_ref"]]["data"]["fields"]}
                    channels = set()
                    for requirement in pipeline.get("input_requirements", []):
                        field = native[requirement["field"]]
                        m = field.get("measurement", {})
                        if (
                            requirement["purpose"] == "feature"
                            and m.get("quantity") == variables[name]["quantity"]
                        ):
                            channels.add(m["channel_ref"])
                    if len(channels) < variables[name]["minimum_channels"]:
                        raise ValueError(
                            "Task measurement output lacks audited channel input requirements"
                        )
            if pipeline["execution_enabled"]:
                if not any(
                    set(u["required_variables"]) <= set(bindings) for u in req["uses"].values()
                ):
                    raise ValueError("Pipeline cannot satisfy any declared task use")

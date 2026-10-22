"""Schema, graph and scientific admission invariants."""

from jsonschema import Draft202012Validator, FormatChecker

from .validation.nodes import validate_nodes
from .validation.tasks import validate_task_requirements
from .validation.edges import validate_edges


def validate(model, schema):
    """Check JSON structure, reference types and lossless projection invariants."""
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(model)
    nodes, edges = model["nodes"], model["edges"]

    sources, tasks = validate_nodes(nodes)
    validate_edges(nodes, edges, sources, tasks)
    validate_task_requirements(nodes)
    return model

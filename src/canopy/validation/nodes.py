"""Shared graph-node identity and ordering rules."""


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

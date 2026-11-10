"""Project existing single and joint admissions into shared presentation metadata.

This index never enables execution. Scientific callers keep using their existing
source registries and validators; views consume the same bounded admission facts.
"""

import hashlib
from pathlib import Path


def project_preparations(root, model):
    root = Path(root)
    nodes = model["nodes"]
    routes = []
    for identity, node in nodes.items():
        if node["type"] != "pipeline_spec" or not node["data"]["execution_enabled"]:
            continue
        data = node["data"]
        refs = list(dict.fromkeys([*data.get("evidence_refs", []), data["validation_ref"]]))
        evidence = []
        for ref in refs:
            item = nodes[ref]["data"]
            evidence.append(
                {
                    "id": ref,
                    "url": item.get("url") or item.get("local"),
                    "sha256": item.get("sha256"),
                }
            )
        profile = nodes[data["source_ref"]]["data"]["profile"]
        routes.append(
            dict(
                id=identity,
                source_ref=data["source_ref"],
                task_refs=[data["task_ref"]],
                name=data["name"],
                scope=data["selection"],
                detail=profile["discovery"]["preparation"]["detail"],
                evidence=evidence,
            )
        )
    joint_path = root / "data/joint/source-lock.json"
    if joint_path.exists():
        from .joint.model import load_source, require_admitted

        source = load_source(joint_path)
        require_admitted(source)
        routes.append(
            dict(
                id=source["pipeline_ref"],
                source_ref=source["source_ref"],
                task_refs=["task:instances", "task:species"],
                name="Joint instances + taxonomy",
                scope=f"{len(source['plots'])} admitted plots; unassigned partitions",
                detail="Only the listed complete plots are admitted. Native point instances and tree taxonomy remain separate targets. Whole-release reference, annotation correctness and evaluation independence are not established.",
                plots=[p["path"] for p in source["plots"]],
                points=sum(p["points"] for p in source["plots"]),
                trees=sum(len(p["trees"]) for p in source["plots"]),
                source_scope_sha256=source["admission"]["source_scope_sha256"],
                registry_sha256=hashlib.sha256(joint_path.read_bytes()).hexdigest(),
                evidence=[
                    dict(url=p, sha256=hashlib.sha256((root / p).read_bytes()).hexdigest())
                    for p in [
                        "evidence/joint/native-validation.json",
                        "evidence/joint/expanded-package-validation.json",
                        "docs/sources/TREESCAN-JOINT.md",
                        "docs/sources/TREESCAN-EXPANSION-REVIEW.md",
                    ]
                ],
            )
        )
    elif "zenodo:19127709" in nodes:
        raise ValueError("Missing pinned joint source registry")
    return sorted(routes, key=lambda route: route["id"])


def reconcile_metadata(catalog, root, model):
    """Refresh current presentation provenance, retaining historical observations."""
    catalog["preparations"] = project_preparations(root, model)
    catalog.setdefault("observation_snapshot_at", catalog["generated_at"])
    catalog["generated_at"] = (
        max(d["review"]["reviewed_at"] for d in catalog["datasets"]) + "T00:00:00+00:00"
    )
    catalog["scope"] = (
        "Pinned public source releases, documented reference and explicitly bounded preparation admissions. Acquisition totals describe the historical observation snapshot only."
    )
    catalog["content_review"]["scope"] = (
        "Editorial reconciliation of existing evidence; no new scientific admission. Historical payload evidence retains its original dates."
    )
    catalog["content_review"]["reviewed_at"] = max(
        d["review"]["reviewed_at"] for d in catalog["datasets"]
    )
    catalog["evidence"] = [
        dict(name=name, path=path)
        for name, path in [
            ("Current source definitions and pending questions", "docs/reviews/SOURCE-CONTENT.md"),
            ("Historical content review", "docs/reviews/CONTENT-REVIEW.md"),
            ("Pinned original-source asset inventory", "docs/lidar-acquisition-inventory.json"),
            ("Classification native audit", "evidence/classification/full-native-audit.json"),
            ("Joint source review", "docs/sources/TREESCAN-JOINT.md"),
        ]
    ]

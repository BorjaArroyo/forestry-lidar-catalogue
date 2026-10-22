"""Project classification acquisition metadata without inventing downloaded payloads."""

from canopy.classification.dataio import read_json

from canopy.paths import repository_root


def source_datasets(*, graph, identifiers):
    registry = read_json(repository_root() / "data/classification/source-lock.json")
    results = []
    for source in registry["sources"]:
        ref = source["source_ref"]
        identity = ref.removeprefix("zenodo:").replace(":", "-")
        if identity not in identifiers:
            continue
        profile = graph["nodes"][ref]["data"]["profile"]
        results.append(
            dict(
                id=identity,
                source_ref=ref,
                title=source["name"],
                url=source["url"],
                doi=None,
                version=source["version"],
                license=source["license"],
                cloud_count=0,
                points=0,
                chunks=0,
                assets=len(source["assets"]),
                source_fields=[],
                schemas=[],
                example_paths=[],
                source_metadata_sha256=profile["review"]["observations_snapshot"][
                    "source_metadata_sha256"
                ],
                download_bytes=sum(a["size_bytes"] for a in source["assets"]),
                coordinate_references=[],
                coordinate_policy=source["coordinate_policy"],
                deferred_clouds=0,
            )
        )
    if {row["id"] for row in results} != set(identifiers):
        raise ValueError("New sources require a reviewed metadata projection")
    return results

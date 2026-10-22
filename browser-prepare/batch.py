"""Assemble complete audited scenes without changing their arrays or semantics."""

import copy


def combine_manifests(manifests):
    if not manifests:
        raise ValueError("Select at least one complete plot")
    if len(manifests) == 1:
        return copy.deepcopy(manifests[0])
    result = copy.deepcopy(manifests[0])
    merged_keys = {"scenes", "native_schemas", "selection", "scope"}
    common = {k: v for k, v in result.items() if k not in merged_keys}
    result.update(scenes=[], native_schemas={})
    paths, identities = set(), set()
    for manifest in manifests:
        if {k: v for k, v in manifest.items() if k not in merged_keys} != common:
            raise ValueError(
                "Cannot combine different source releases, policies or producer packages"
            )
        if manifest["selection"]["available_plots"] != result["selection"]["available_plots"]:
            raise ValueError("Selection scope differs between scenes")
        if set(manifest["selection"]["paths"]) != {s["path"] for s in manifest["scenes"]}:
            raise ValueError("Incomplete scene selection")
        for scene in manifest["scenes"]:
            if scene["path"] in paths or scene["id"] in identities:
                raise ValueError("Duplicate scene in the selected dataset")
            paths.add(scene["path"])
            identities.add(scene["id"])
            result["scenes"].append(copy.deepcopy(scene))
        for key, native in manifest["native_schemas"].items():
            if key in result["native_schemas"] and result["native_schemas"][key] != native:
                raise ValueError("Conflicting native schema fingerprint")
            result["native_schemas"][key] = copy.deepcopy(native)
    result["selection"]["paths"] = [scene["path"] for scene in result["scenes"]]
    result["scope"] = "Complete selected LAS plots; unselected release plots are not included"
    return result

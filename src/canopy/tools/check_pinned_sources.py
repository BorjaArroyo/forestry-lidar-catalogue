"""Detect drift of pinned provider records without downloading payloads.

Compares the pinned acquisition inventory against the provider's current
record metadata (file names, sizes and checksums) and reports any mismatch.
A mismatch means the pinned release is no longer what the catalog reviewed;
it does not authorize any catalog change by itself.
"""

import argparse
import json
import ssl
import sys
import urllib.request
from pathlib import Path
from ..paths import repository_root

ROOT = repository_root()
TIMEOUT_SECONDS = 60


def compare_record(expected_files, observed_files):
    """Return the list of drift problems for one pinned record.

    expected_files and observed_files are lists of {name, size_bytes,
    provider_checksum} / provider file entries. Zenodo's InvenioRDM API
    names files 'key'; other providers may use 'name'. Provider checksums
    use the provider's ``algo:digest`` form.
    """
    observed = {str(entry.get("name", entry.get("key"))): entry for entry in observed_files}
    problems = []
    for expected in expected_files:
        name = expected["name"]
        entry = observed.get(name)
        if entry is None:
            problems.append(f"{name}: no longer published on the record")
            continue
        if entry.get("size") != expected["size_bytes"]:
            problems.append(f"{name}: size {entry.get('size')} != pinned {expected['size_bytes']}")
        if str(entry.get("checksum", "")).lower() != expected["provider_checksum"].lower():
            problems.append(
                f"{name}: checksum {entry.get('checksum')} != pinned {expected['provider_checksum']}"
            )
    extra = sorted(set(observed) - {expected["name"] for expected in expected_files})
    for name in extra:
        problems.append(f"{name}: added to the record after pinning")
    return problems


def fetch_json(url):
    context = ssl.create_default_context()
    request = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": "canopy-source-drift-check"}
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS, context=context) as response:
        return json.loads(response.read().decode("utf-8"))


def head_ok(url):
    context = ssl.create_default_context()
    request = urllib.request.Request(
        url, method="HEAD", headers={"User-Agent": "canopy-source-drift-check"}
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS, context=context) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except (urllib.error.URLError, TimeoutError) as error:
        return f"unreachable: {error}"


def check(inventory_path):
    inventory = json.loads(Path(inventory_path).read_text())
    failures = []
    for record in inventory["records"]:
        record_id = record["record_id"]
        try:
            observed = fetch_json(record["api_url"])
        except Exception as error:  # noqa: BLE001 - report and continue with other records
            failures.append(f"{record_id}: record metadata unreachable: {error}")
            continue
        problems = compare_record(record["files"], observed.get("files", []))
        status = head_ok(record["url"])
        if not isinstance(status, int) or status >= 400:
            problems.append(f"record page {record['url']}: {status}")
        if problems:
            failures.extend(f"{record_id}: {problem}" for problem in problems)
        else:
            print(f"{record_id}: {len(record['files'])} pinned assets unchanged")
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--inventory", type=Path, default=ROOT / "docs" / "lidar-acquisition-inventory.json"
    )
    args = parser.parse_args()
    failures = check(args.inventory)
    if failures:
        print("PINNED SOURCE DRIFT", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        sys.exit(1)
    print("All pinned records match their reviewed metadata")


if __name__ == "__main__":
    main()

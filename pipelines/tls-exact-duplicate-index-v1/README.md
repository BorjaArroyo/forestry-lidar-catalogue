# TLS exact-duplicate index · draft

This package contains its input contract, implementation, tests, prior analysis
and file checksums. No original point clouds are embedded. Execution through
Canopy remains disabled; the entrypoint only performs offline validation and
emits an unapproved candidate index. It does not perform curation.

Use Python 3.11.11 (standard library only), with the acquisition root as input:

```bash
python3 test_pipeline.py
python3 entrypoint.py --root /absolute/acquisition/root --output /absolute/new-report --sample-groups 3
```

Omit --sample-groups to verify all 236 pinned files. Output must be new and outside
the input root. All selected bytes are rehashed; original paths are only opened
for reading. validation-report.json records checked inputs and open decisions.
No geometry or label validation is claimed. Keep validation artifacts with the
package-lock fingerprint. The lock is a checksum manifest, not a signature or
human approval; audit the final package digest before admission.

The Dockerfile pins the Python base by immutable registry digest for linux/arm64.
Build locally, inspect the resulting image ID, and use that exact ID to validate.
Mount inputs read-only and a distinct new host output directory at /outputs:

```bash
docker build --platform linux/arm64 --network=none --pull=false -t canopy-tls-validator .
docker image inspect canopy-tls-validator --format '{{.Id}}'
```

Run the inspected sha256 image ID with --network=none, --read-only, --cap-drop=ALL,
--security-opt=no-new-privileges and explicit read-only /inputs plus writable
/outputs mounts. Pass --root /inputs --output /outputs/report. Container tests can
use --entrypoint python with test_pipeline.py. Base-image acquisition is a declared
setup requirement; validation itself has no network dependency. Execution through
Canopy remains blocked. See the external registry/evidence for actual validation
results and remaining gates; package metadata is a declaration, not approval.


## Verified local snapshots (version 0.2)

The mounted source has produced inconsistent read-back hashes. Do not repair by
changing expected hashes or assume that a later successful read proves the mount
stable. --stage-to /absolute/new-local-snapshot copies every pinned input to a
reliable local filesystem before full validation. A snapshot is admitted only
when byte count, expected source hash and an independent local read-back match.
At most three attempts are made, all failed observations are recorded, persistent
mismatches stop the run, and a failed snapshot is not a valid pipeline input.
Originals are never replaced. Reserve 1.88 GB plus report/temporary overhead.

```bash
python3 test_staging.py
python3 entrypoint.py --root /absolute/acquisition/root --stage-to /absolute/new-local-snapshot --output /absolute/new-report
```

For containers, materialize first or provide a separate writable local /staging
mount; /inputs stays read-only and /outputs is a distinct directory. The current
Canopy service remains blocked pending human audit. This workaround isolates the
pipeline from an unreliable input mount; it does not claim to fix the WebDAV
server/client or establish the historical cause of inconsistent reads.

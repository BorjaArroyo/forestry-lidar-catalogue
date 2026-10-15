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

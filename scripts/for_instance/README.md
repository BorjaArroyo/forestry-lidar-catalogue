# FOR-instance local preparation 1.0.0

Self-contained Python 3.11 package for the exact 32 LAS plots in the pinned Zenodo
record 8287792 archive. Install requirements.txt, then run prepare.py with --input
(the acquisition root) and --output (a separate new or matching interrupted output).
All package runtime artifacts are pinned by package-lock.json. The source lock
contains per-file hashes, dimensions, counts and exact provider split assignments.

The conservative mask preserves all rows and original native attributes: classes
0/1/3 and nonpositive tree IDs are unknown (-1), terrain is background (0), and
positive tree IDs in classes 4/5/6 remain unchanged. Read policy.json for semantic
limits. Fifty absent NIBIO2 CSV rows remain reported. No independent-site claim
is made. Original files remain read-only. No network, Ray or Kubernetes is used.

Outputs are uncompressed NPZ chunks of at most 250,000 rows and task-package.json.
Each chunk has float64 xyz, int64 instance, bool instance_valid, uint8 native_class
and losslessly retained original_points. Native LAS dimension descriptors, scales,
offsets, source hashes, output hashes and official dev/test labels are included.
One output lock prevents concurrent writers. Verified complete plots checkpoint
for resume; changed contracts and corrupted outputs are rejected. Inputs pass
a private snapshot copy plus SHA256 read-back; failed reads retry at most three
times. The output is committed only after complete source and output verification.

Run test_pipeline.py for bounded offline fixtures. Complete-source validation
evidence is published separately in evidence/for-instance-preparation-validation.json.
Scientific annotation quality, independent-site evaluation and article-specific
scoring remain separate review requirements.

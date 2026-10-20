# FGI-EMIT: audited native task preparation

Record [19351234](https://zenodo.org/records/19351234) is the next source candidate
for the instance-preparation workflow. Its source-specific adapter is now admitted after complete-source integrity and independent payload validation. No multispectral segmentation model or article evaluator is certified.

## Observed scope

The [evidence report](evidence/fgi-emit-measurements.json) records all 19 original
LAS headers and the first 10,000 stored points per plot: 190,000 sampled points.
All headers share one 39-field schema, LAS 1.4 point format 7. Their point counts
sum to 60,793,586. No inspected header supplies a CRS. Numeric coordinates are
local to plots; the old research converter's projected-coordinate description
must not be reused as evidence of a CRS or datum.

The small provider `metadata.yaml` asset passed its published MD5 and saved SHA256.
Original plot sizes match saved manifests. **That initial 2026-10-19 audit did not recompute full LAS payload hashes. The complete 2026-10-20 audit below supersedes that integrity limitation.** Prefix samples are not representative coverage estimates, and this
audit does not assess full annotation completeness, instance consistency or
spatial association accuracy.

## Measurements and reference

The [official source repository](https://github.com/ruoppa/fgi_emit) identifies:

| Origin scanner ID | Sensor | Wavelength |
| --- | --- | --- |
| 1 | RIEGL VUX-1HA | 1550 nm |
| 2 | RIEGL miniVUX-1DL | 905 nm |
| 3 | RIEGL VQ-840-G | 532 nm |

`user_data` identifies the origin scanner. The packed LAS `scanner_channel`
field has a different meaning. Shared graph channel nodes describe each source
scanner once; typed field descriptors refer to those nodes.

| Field family, suffix 1/2/3 | Stored type | Documented missing value |
| --- | --- | --- |
| `intensity_*` | uint16 | 0 |
| `amplitude_*` | float32 | 0 |
| `reflectance_*` | float32 | -9999 |
| `deviation_*` | uint16 | 65535 |

Each feature-validity mask requires finite values that differ from that field's
sentinel. Nothing is imputed. The suffix-field units and scaling stay unknown;
units from base LAS attributes named `Amplitude` or `Reflectance` are not inherited.
Every suffix-field header reports nearest-neighbor association within 0.25 m.
That provenance does not prove exact co-location, calibration or comparability.

`red/green/blue` are display fields. The pinned YAML calls them scaled intensity,
while [public Table 4](https://research.aalto.fi/en/datasets/fgi-emit-a-multispectral-high-density-airborne-laser-scanning-ben/)
calls them scaled reflectance. This conflict and their unspecified missing-value
rule remain explicit. YAML `NULL` does not establish that zero is missing.

`tree_index`, `classification`, `edge` and `dead` remain reference fields.
Instance zero means no assigned tree instance; it is not interpreted through the
measurement-sentinel machinery. FGI class 2 means building, not FOR-instance ground.
These descriptors alone do not define reference validity. The admitted conservative policy is specified below; no article evaluator is implemented.

## Pipeline declarations

Model 1.3 permits input requirements to name native contract fields, their use
(preservation, geometry, reference or feature), expected unit, missing-value
policy, required calibration and required association validation. Enabled feature
declarations fail on unknown requested units, undocumented missingness, silent
sentinel preservation or unmet calibration/association requirements. Display RGB
cannot be declared as quantitative measurements. Matching wavelengths alone do
not establish compatibility. These are metadata consistency checks, not execution
or scientific validation.

## Reproduce and continue

Use the ingestion environment with laspy, NumPy and PyYAML pinned by
`requirements.txt` in the public checkout or `scripts/lidar-ingestion-requirements.txt`
in the research checkout. The audit is bounded and runs locally:

```bash
python scripts/audit_fgi_measurements.py --input /absolute/acquisition --output /absolute/new-evidence.json
```

Complete-source integrity, reference-policy and all-plot adapter validation have now passed; retain their versioned evidence. Retain 13 official training plots and six test plots;
recommended validation membership is optional. Review capture ancestry and model
exposure before claiming independent geographic transfer.

Source data and derived source-metadata evidence retain the provider's declared
CC BY-NC-SA 4.0 terms and attribution to Ruoppa et al., 2026. Code licensing does
not replace those terms. No raw point clouds are published by this change.


## Complete admission (2026-10-20)

- [Full audit](evidence/fgi-emit-full-audit.json): both provider archive checksums,
  all 19 LAS SHA256 and every point reverified; 60,793,586 points and 1,561 instances.
- [Preparation validation](evidence/fgi-emit-preparation-validation.json): every
  point processed into 254 bounded blocks and read by the independent validator.
  Temporary native blocks were removed after validation; scene/block fingerprints
  remain in the report. The pinned producer package is `scripts/fgi_emit/`.
- Native class 1 with positive `tree_index` retains that ID. Classes 2/3/4 are
  known non-tree background. Class 0 (including understory), class 5 and class-1
  points without positive identity stay unknown. `instance_valid = instance >= 0`.
  Positive IDs outside class 1 fail closed. No point or native class is removed.
- `features = column_stack(reflectance_1, reflectance_2, reflectance_3)` retains
  float32 native values. `feature_valid = isfinite(features) & (features != -9999)`.
  Missing values are never imputed. All original fields, edge/dead flags and
  float64 decoded XYZ remain available. The precise rules also live in the
  canonical graph and `scripts/fgi_emit/policy.json`.

This preparation policy differs from an article scoring protocol. Units, calibration,
co-registration accuracy, full annotation completeness and independent geographic
transfer remain unresolved. The browser executes one admitted source per plan;
existing prepared packages can be composed with the common task-folder exporter.

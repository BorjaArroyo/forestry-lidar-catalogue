# FGI-EMIT: measurement metadata review

Record [19351234](https://zenodo.org/records/19351234) is the next source candidate
for the existing instance-preparation workflow. Its preparation remains **TBD**.
This increment describes measurements and requirements; it does not prepare data
or validate a multispectral segmentation model.

## Observed scope

The [evidence report](evidence/fgi-emit-measurements.json) records all 19 original
LAS headers and the first 10,000 stored points per plot: 190,000 sampled points.
All headers share one 39-field schema, LAS 1.4 point format 7. Their point counts
sum to 60,793,586. No inspected header supplies a CRS. Numeric coordinates are
local to plots; the old research converter's projected-coordinate description
must not be reused as evidence of a CRS or datum.

The small provider `metadata.yaml` asset passed its published MD5 and saved SHA256.
Original plot sizes match saved manifests. **Full LAS payload hashes were not
recomputed.** Prefix samples are not representative coverage estimates, and this
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
No new instance-validity or evaluator policy is admitted by these descriptors.

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

Complete full integrity, reference-policy and all-plot adapter validation before
enabling preparation. Retain 13 official training plots and six test plots;
recommended validation membership is optional. Review capture ancestry and model
exposure before claiming independent geographic transfer.

Source data and derived source-metadata evidence retain the provider's declared
CC BY-NC-SA 4.0 terms and attribution to Ruoppa et al., 2026. Code licensing does
not replace those terms. No raw point clouds are published by this change.

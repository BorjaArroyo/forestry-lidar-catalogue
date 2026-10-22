window.LIDAR_CATALOG = {
  "schema_version": "0.1",
  "generated_at": "2026-10-17T21:42:55.468725+00:00",
  "title": "Canopy / LiDAR Knowledge Hub",
  "scope": "Acquired sources; compatibility is task-specific and does not authorize training or redistribution.",
  "summary": {
    "datasets": 12,
    "assets": 96,
    "clouds": 5626,
    "points": 22146246558,
    "chunks": 48177,
    "deferred": 3,
    "acquisition_errors": 0,
    "conversion_errors": 0,
    "duplicate_source_groups": 123,
    "duplicate_cloud_copies": 118,
    "identical_scene_groups": 398,
    "identical_scene_extras": 398
  },
  "tasks": [
    {
      "name": "Tree segmentation",
      "title": "Individual-tree segmentation",
      "description": "Requires instance identity, annotation coverage, and boundary rules.",
      "visible": true,
      "status": "work_in_progress",
      "requirements": {
        "variables": [
          {
            "key": "xyz",
            "label": "Geometry",
            "purpose": "geometry",
            "default": "required",
            "detail": "Native decoded coordinates; no resampling, normalization or inferred CRS.",
            "output_fields": [
              {
                "name": "xyz",
                "dtypes": [
                  "float64"
                ],
                "shape": [
                  "N",
                  3
                ]
              }
            ],
            "quantity": null,
            "minimum_channels": 0
          },
          {
            "key": "instance_reference",
            "label": "Tree-instance reference",
            "purpose": "reference",
            "default": "off",
            "detail": "Scene-local identities and a conservative validity mask; annotation completeness is not certified.",
            "output_fields": [
              {
                "name": "instance",
                "dtypes": [
                  "int64"
                ],
                "shape": [
                  "N"
                ]
              },
              {
                "name": "instance_valid",
                "dtypes": [
                  "bool"
                ],
                "shape": [
                  "N"
                ]
              }
            ],
            "quantity": null,
            "minimum_channels": 0
          },
          {
            "key": "reflectance",
            "label": "Multispectral reflectance",
            "purpose": "measurement",
            "default": "optional",
            "detail": "At least two documented spectral channels with separate validity masks. Native units, calibration and association require source-specific review; RGB is not a substitute.",
            "output_fields": [
              {
                "name": "features",
                "dtypes": [
                  "float32"
                ],
                "shape": [
                  "N",
                  "C"
                ]
              },
              {
                "name": "feature_valid",
                "dtypes": [
                  "bool"
                ],
                "shape": [
                  "N",
                  "C"
                ]
              }
            ],
            "quantity": "reflectance",
            "minimum_channels": 2
          }
        ],
        "uses": {
          "training": {
            "label": "Training data",
            "required_variables": [
              "xyz",
              "instance_reference"
            ],
            "allowed_partitions": [
              "dev",
              "train"
            ],
            "detail": "Keep published partitions; consume instance_valid for supervised loss. Published test scenes are excluded from this consumer. No train/validation split or model fit is created."
          },
          "evaluation": {
            "label": "Evaluation data",
            "required_variables": [
              "xyz",
              "instance_reference"
            ],
            "allowed_partitions": [
              "test"
            ],
            "detail": "Prepare published test reference arrays; the scoring protocol and independent-zone split require a separate audit."
          },
          "inference": {
            "label": "Inference data",
            "required_variables": [
              "xyz"
            ],
            "allowed_partitions": [
              "dev",
              "train",
              "test"
            ],
            "detail": "Reference labels are optional for inference; the source adapter may still preserve them losslessly."
          }
        }
      },
      "id": "instances",
      "preparation_sources": {
        "8287792": {
          "pipelines": [
            {
              "id": "pipeline:for-instance-plot-instances:1.0.0",
              "output_ref": "contract:for-instance-plot-instances:1.0.0",
              "variable_outputs": {
                "xyz": [
                  "xyz"
                ],
                "instance_reference": [
                  "instance",
                  "instance_valid"
                ]
              }
            }
          ],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "16742708": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "15193973": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "17172162": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "19351234": {
          "pipelines": [
            {
              "id": "pipeline:fgi-emit-plot-instances:1.0.0",
              "output_ref": "contract:fgi-emit-plot-instances:1.0.0",
              "variable_outputs": {
                "xyz": [
                  "xyz"
                ],
                "instance_reference": [
                  "instance",
                  "instance_valid"
                ],
                "reflectance": [
                  "features",
                  "feature_valid"
                ]
              }
            }
          ],
          "native_reflectance": [
            {
              "field": "reflectance_1",
              "channel_ref": "channel:fgi-emit-scanner-1:1.0.0",
              "wavelength_nm": 1550
            },
            {
              "field": "reflectance_2",
              "channel_ref": "channel:fgi-emit-scanner-2:1.0.0",
              "wavelength_nm": 905
            },
            {
              "field": "reflectance_3",
              "channel_ref": "channel:fgi-emit-scanner-3:1.0.0",
              "wavelength_nm": 532
            }
          ],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "15913427": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "19127709": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "16875688": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "16910335": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "7307956": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "13255198": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "grodata-128035-1.0": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        }
      }
    },
    {
      "name": "Forest components",
      "title": "Wood, foliage & ground",
      "description": "Class meanings must match; tree labels alone do not identify wood or foliage.",
      "visible": false,
      "status": "tbd",
      "id": "components"
    },
    {
      "name": "Tree species",
      "title": "Species classification",
      "description": "Classify isolated tree observations at documented genus or species rank; native sensor views and published partitions remain separate.",
      "visible": true,
      "status": "work_in_progress",
      "requirements": {
        "variables": [
          {
            "key": "xyz",
            "label": "Geometry",
            "purpose": "geometry",
            "default": "required",
            "detail": "Native scaled XYZ, without centering, normalization or sensor-view fusion.",
            "output_fields": [
              {
                "name": "xyz",
                "dtypes": [
                  "float64"
                ],
                "shape": [
                  "N",
                  3
                ]
              }
            ],
            "quantity": null,
            "minimum_channels": 0
          },
          {
            "key": "taxonomy",
            "label": "Taxonomic reference",
            "purpose": "reference",
            "default": "off",
            "detail": "Scalar genus/species reference per physical tree; validity is separate for each rank.",
            "output_fields": [
              {
                "name": "taxonomy",
                "dtypes": [
                  "json"
                ],
                "shape": []
              },
              {
                "name": "reference_valid",
                "dtypes": [
                  "json"
                ],
                "shape": []
              }
            ],
            "quantity": null,
            "minimum_channels": 0
          }
        ],
        "uses": {
          "training": {
            "label": "Training data",
            "detail": "Preserve published partitions. Supervised uses require reference valid at the selected rank; geographic independence is not demonstrated.",
            "required_variables": [
              "xyz",
              "taxonomy"
            ],
            "allowed_partitions": [
              "dev",
              "train"
            ]
          },
          "validation": {
            "label": "Validation data",
            "detail": "Preserve published partitions. Supervised uses require reference valid at the selected rank; geographic independence is not demonstrated.",
            "required_variables": [
              "xyz",
              "taxonomy"
            ],
            "allowed_partitions": [
              "validate"
            ]
          },
          "evaluation": {
            "label": "Evaluation data",
            "detail": "Preserve published partitions. Supervised uses require reference valid at the selected rank; geographic independence is not demonstrated.",
            "required_variables": [
              "xyz",
              "taxonomy"
            ],
            "allowed_partitions": [
              "test"
            ]
          },
          "inference": {
            "label": "Inference data",
            "detail": "Preserve published partitions. Supervised uses require reference valid at the selected rank; geographic independence is not demonstrated.",
            "required_variables": [
              "xyz"
            ],
            "allowed_partitions": [
              "dev",
              "train",
              "validate",
              "test",
              "unassigned"
            ]
          }
        }
      },
      "id": "species",
      "preparation_sources": {
        "8287792": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "16742708": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "15193973": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "17172162": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "19351234": {
          "pipelines": [],
          "native_reflectance": [
            {
              "field": "reflectance_1",
              "channel_ref": "channel:fgi-emit-scanner-1:1.0.0",
              "wavelength_nm": 1550
            },
            {
              "field": "reflectance_2",
              "channel_ref": "channel:fgi-emit-scanner-2:1.0.0",
              "wavelength_nm": 905
            },
            {
              "field": "reflectance_3",
              "channel_ref": "channel:fgi-emit-scanner-3:1.0.0",
              "wavelength_nm": 532
            }
          ],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "15913427": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "19127709": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "16875688": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "16910335": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "7307956": {
          "pipelines": [],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "13255198": {
          "pipelines": [
            {
              "id": "pipeline:for-species20k-classification:1.0.0",
              "output_ref": "contract:for-species20k-taxonomy:1.0.0",
              "variable_outputs": {
                "xyz": [
                  "xyz"
                ],
                "taxonomy": [
                  "taxonomy",
                  "reference_valid"
                ]
              }
            }
          ],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        },
        "grodata-128035-1.0": {
          "pipelines": [
            {
              "id": "pipeline:biodiv-3dtrees-classification:1.0.0",
              "output_ref": "contract:biodiv-3dtrees-taxonomy:1.0.0",
              "variable_outputs": {
                "xyz": [
                  "xyz"
                ],
                "taxonomy": [
                  "taxonomy",
                  "reference_valid"
                ]
              }
            }
          ],
          "native_reflectance": [],
          "note": "Native availability does not admit feature extraction, calibration or a preparation pipeline."
        }
      }
    },
    {
      "name": "Geometry & robustness",
      "title": "Geometry and consistency checks",
      "description": "Unlabeled clouds can test consistency and distributions, not segmentation accuracy.",
      "visible": false,
      "status": "tbd",
      "id": "geometry"
    },
    {
      "name": "Multispectral",
      "title": "Spectral learning",
      "description": "Wavelengths, channel units, normalization, and registration must be checked.",
      "visible": false,
      "status": "tbd",
      "id": "spectral"
    },
    {
      "name": "Tree structure",
      "title": "Structure and biomass research",
      "description": "QSMs are derived models; independent reference measurements are required for accuracy claims.",
      "visible": false,
      "status": "tbd",
      "id": "biomass"
    }
  ],
  "datasets": [
    {
      "name": "FOR-instance",
      "short": "FOR v1",
      "modalities": [
        "Airborne"
      ],
      "domain": "Five forest collections",
      "geography": "Norway · Austria · Czechia · New Zealand · Australia",
      "scanner": "RIEGL UAV systems; collection-specific models",
      "spectral": false,
      "kind": "Plot clouds",
      "labels": "Plot-local treeID; terrain, low vegetation, outside-tree, stem, live-branch and woody-branch classes; species in some collections",
      "role": "Published dev/test benchmark",
      "readiness": "Native labels; mapping incomplete",
      "tasks": [
        "instances",
        "components",
        "geometry",
        "species"
      ],
      "conditional": [
        "components",
        "species"
      ],
      "note": "Original semantic classes do not provide a simple wood/foliage crosswalk. Preserve the official dev/test protocol.",
      "correction": "32 files retain original classification but have no canonical semantic mapping.",
      "provenance": "Source of collections reused by FOR-instance V2; a new release is not an independent site.",
      "review": {
        "reviewed_at": "2026-10-17",
        "scope": "Editorial source and metadata review; no new payload, rights or task admission",
        "observation_unit": "Annotated LAS plot; treeID is local to a plot. Collections and releases are not independent samples.",
        "source_facts": [
          {
            "text": "Five UAV collections span Norway, Czechia, Austria, New Zealand and Australia. The provider supplies a development/test split.",
            "url": "https://zenodo.org/records/8287792",
            "label": "Provider record"
          },
          {
            "text": "Native classification: 0 unclassified, 1 low vegetation, 2 terrain, 3 outside trees, 4 stem, 5 live branches, 6 woody branches. Live branches do not identify foliage alone. treeSP and field traits vary by collection.",
            "url": "https://zenodo.org/records/8287792/files/FORinstance_dataset.zip",
            "label": "Archive readMe.txt"
          }
        ],
        "local_observations": [
          "32 normalized plots retain classification in original_points; the coarse semantic view has no mapping for it. Some plots lack treeSP."
        ],
        "open_questions": [
          "Resolve treeSP lookup tables per collection before species pooling.",
          "Reconcile plot/capture ancestry with FOR-instance V2 before assigning independent splits."
        ],
        "published_protocol": "Development data may be split for model selection; the official test data are reserved for final evaluation.",
        "observations_snapshot": {
          "source_metadata_sha256": "3598069530f4aa23c87b936baaac582b1c36483c48665359e44f42248cb7ea53",
          "cloud_count": 32,
          "points": 151478959,
          "schemas": [
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "red",
                "green",
                "blue",
                "treeID",
                "treeSP"
              ],
              "files": 8
            },
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "gps_time",
                "red",
                "green",
                "blue",
                "treeID",
                "treeSP"
              ],
              "files": 10
            },
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "gps_time",
                "treeID",
                "treeSP"
              ],
              "files": 10
            },
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "red",
                "green",
                "blue",
                "treeID"
              ],
              "files": 2
            },
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "gps_time",
                "red",
                "green",
                "blue",
                "treeID"
              ],
              "files": 2
            }
          ]
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "documented",
          "reason": "Native instance reference is described; plot coverage, boundary rules and adapter still require task review."
        },
        "components": {
          "status": "partial",
          "reason": "Native component labels are described; granularity, unknown classes and crosswalk losses remain task-specific."
        },
        "species": {
          "status": "partial",
          "reason": "treeSP occurs in some schemas and field traits vary by collection; lookup and coverage must be joined first."
        },
        "geometry": {
          "status": "documented",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        }
      },
      "study_context": "No fixed local fitting/evaluation reservation is asserted by this catalog. Task and model exposure review still apply.",
      "id": "8287792",
      "title": "FOR-instance: a UAV laser scanning benchmark dataset for semantic and   instance segmentation of individual trees",
      "url": "https://zenodo.org/records/8287792",
      "doi": "10.5281/zenodo.8287792",
      "version": "1",
      "license": "cc-by-4.0",
      "cloud_count": 32,
      "points": 151478959,
      "chunks": 318,
      "assets": 1,
      "source_fields": [
        "X",
        "Y",
        "Z",
        "blue",
        "classification",
        "edge_of_flight_line",
        "gps_time",
        "green",
        "intensity",
        "key_point",
        "number_of_returns",
        "point_source_id",
        "red",
        "return_number",
        "scan_angle_rank",
        "scan_direction_flag",
        "synthetic",
        "treeID",
        "treeSP",
        "user_data",
        "withheld"
      ],
      "schemas": [
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "red",
            "green",
            "blue",
            "treeID",
            "treeSP"
          ],
          "files": 8
        },
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "gps_time",
            "red",
            "green",
            "blue",
            "treeID",
            "treeSP"
          ],
          "files": 10
        },
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "gps_time",
            "treeID",
            "treeSP"
          ],
          "files": 10
        },
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "red",
            "green",
            "blue",
            "treeID"
          ],
          "files": 2
        },
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "gps_time",
            "red",
            "green",
            "blue",
            "treeID"
          ],
          "files": 2
        }
      ],
      "example_paths": [
        "sources/8287792/originals/FORinstance_dataset/CULS/plot_3_annotated.las",
        "sources/8287792/originals/FORinstance_dataset/NIBIO/plot_10_annotated.las",
        "sources/8287792/originals/FORinstance_dataset/NIBIO/plot_11_annotated.las"
      ],
      "source_metadata_sha256": "3598069530f4aa23c87b936baaac582b1c36483c48665359e44f42248cb7ea53",
      "coordinate_references": [
        {
          "value": "EPSG:25833",
          "files": 3
        },
        {
          "value": "EPSG:25832",
          "files": 20
        },
        {
          "value": "Unknown / not recorded",
          "files": 4
        },
        {
          "value": "EPSG:2193",
          "files": 5
        }
      ],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 0,
      "discovery": {
        "unit": "plots",
        "unit_label": "Plot / scene clouds",
        "instance_reference": {
          "status": "plots",
          "label": "Plot-level tree IDs reported"
        },
        "coverage": "Annotated plots from five collections; native classification includes terrain and outside-tree points.",
        "limitation": "The archive has 32 plots; 50 NIBIO2 CSV entries are absent. Preserve unknown-reference masks and official dev/test; shared captures with V2 remain unresolved.",
        "preparation": {
          "status": "ready",
          "label": "Validated 32-plot archive preparation",
          "detail": "A self-contained local adapter preserves all 32 archive plots, native fields, conservative reference masks and official dev/test. Its full validation covers 151,478,959 points. The 50 absent NIBIO2 CSV rows remain reported; annotation completeness and geographic independence are not certified.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 1643251814,
      "class_semantics": [
        {
          "code": "0",
          "term": "unclassified",
          "evidence_ref": "evidence:801067957a7667f9f154cfd8"
        },
        {
          "code": "1",
          "term": "low vegetation",
          "evidence_ref": "evidence:801067957a7667f9f154cfd8"
        },
        {
          "code": "2",
          "term": "terrain",
          "evidence_ref": "evidence:801067957a7667f9f154cfd8"
        },
        {
          "code": "3",
          "term": "outside trees",
          "evidence_ref": "evidence:801067957a7667f9f154cfd8"
        },
        {
          "code": "4",
          "term": "stem",
          "evidence_ref": "evidence:801067957a7667f9f154cfd8"
        },
        {
          "code": "5",
          "term": "live branches",
          "evidence_ref": "evidence:801067957a7667f9f154cfd8"
        },
        {
          "code": "6",
          "term": "woody branches",
          "evidence_ref": "evidence:801067957a7667f9f154cfd8"
        }
      ]
    },
    {
      "name": "FOR-instance V2",
      "short": "FOR v2",
      "modalities": [
        "Airborne",
        "Terrestrial",
        "Mobile"
      ],
      "domain": "Mixed forest acquisitions",
      "geography": "Multiple collections; site identity needs reconciliation",
      "scanner": "ALS, TLS and MLS systems; collection-specific",
      "spectral": false,
      "kind": "Plot clouds",
      "labels": "Ground, wood, foliage and tree instances",
      "role": "Published train/validation/test benchmark",
      "readiness": "Native annotation schema",
      "tasks": [
        "instances",
        "components",
        "geometry"
      ],
      "conditional": [
        "instances",
        "components"
      ],
      "note": "Native namespace: 1 terrain, 2 wood, 3 foliage. These class IDs do not define a catalog-wide ontology.",
      "correction": "Scene identities, physical sites and upstream lineage need reconciliation before claiming site-out generalization.",
      "provenance": "Includes FOR-instance descendants and additional acquisitions, including BlueCat and MLS.",
      "review": {
        "reviewed_at": "2026-10-17",
        "scope": "Editorial source and metadata review; no new payload, rights or task admission",
        "observation_unit": "PLY plot or release-specific scene; scene count is not physical-site count.",
        "source_facts": [
          {
            "text": "The record distributes training/validation data, test data and pretrained ForestFormer3D material. The associated code defines semantic_seg: 1 terrain, 2 wood, 3 foliage, with treeID for instances.",
            "url": "https://github.com/SmartForest-no/ForestFormer3D",
            "label": "Official implementation and release"
          }
        ],
        "local_observations": [
          "94 observed PLY files use x, y, z, semantic_seg, treeID. Their headers do not supply CRS in the saved audit."
        ],
        "open_questions": [
          "Reconcile descendants of earlier collections and repeated captures.",
          "Check source scenes, annotation coverage and component rights for the selected task."
        ],
        "published_protocol": "Retain the official train/validation/test identifiers for published comparisons. Geographic independence requires a separate capture-level audit.",
        "observations_snapshot": {
          "source_metadata_sha256": "de53a6a750a5ff471e9266fff7d6a0b295061b4be4638312f354d94c5ffa793a",
          "cloud_count": 94,
          "points": 613942843,
          "schemas": [
            {
              "fields": [
                "x",
                "y",
                "z",
                "semantic_seg",
                "treeID"
              ],
              "files": 94
            }
          ]
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "partial",
          "reason": "Native instance reference is described; plot coverage, boundary rules and adapter still require task review."
        },
        "components": {
          "status": "partial",
          "reason": "Native component labels are described; granularity, unknown classes and crosswalk losses remain task-specific."
        },
        "species": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "geometry": {
          "status": "documented",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        }
      },
      "study_context": "No fixed local fitting/evaluation reservation is asserted by this catalog. Task and model exposure review still apply.",
      "id": "16742708",
      "title": "FOR-instanceV2 dataset and pre-trained model in paper entitled \"ForestFormer3D: A Unified Framework for End-to-End Segmentation of Forest LiDAR 3D Point Clouds\"",
      "url": "https://zenodo.org/records/16742708",
      "doi": "10.5281/zenodo.16742708",
      "version": "Pinned record",
      "license": "gpl-3.0-or-later",
      "cloud_count": 94,
      "points": 613942843,
      "chunks": 1272,
      "assets": 3,
      "source_fields": [
        "semantic_seg",
        "treeID",
        "x",
        "y",
        "z"
      ],
      "schemas": [
        {
          "fields": [
            "x",
            "y",
            "z",
            "semantic_seg",
            "treeID"
          ],
          "files": 94
        }
      ],
      "example_paths": [
        "sources/16742708/originals/test_data/test_data/Yuchen_2023_dls_merged_230209_panoptic_test.ply",
        "sources/16742708/originals/test_data/test_data/TUWIEN_TUWIEN_test_test.ply",
        "sources/16742708/originals/test_data/test_data/SCION_SCION_plot_61_annotated_test.ply"
      ],
      "source_metadata_sha256": "de53a6a750a5ff471e9266fff7d6a0b295061b4be4638312f354d94c5ffa793a",
      "coordinate_references": [
        {
          "value": "Unknown / not recorded",
          "files": 94
        }
      ],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 0,
      "discovery": {
        "unit": "plots",
        "unit_label": "Plot / scene clouds",
        "instance_reference": {
          "status": "plots",
          "label": "Plot-level tree IDs reported"
        },
        "coverage": "Scene files include treeID and component labels; scene count is not independent-site count.",
        "limitation": "Capture lineage and annotation coverage remain unresolved.",
        "preparation": {
          "status": "tbd",
          "label": "Task pipeline TBD",
          "detail": "No self-contained whole-source pipeline has been audited for this plot-instance task.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 3001526346,
      "class_semantics": [
        {
          "code": "1",
          "term": "terrain",
          "evidence_ref": "evidence:d2fbfac86be5da85fd83a052"
        },
        {
          "code": "2",
          "term": "wood",
          "evidence_ref": "evidence:d2fbfac86be5da85fd83a052"
        },
        {
          "code": "3",
          "term": "foliage",
          "evidence_ref": "evidence:d2fbfac86be5da85fd83a052"
        }
      ]
    },
    {
      "name": "ForestSemantic",
      "short": "ForestSemantic",
      "modalities": [
        "Terrestrial"
      ],
      "domain": "Close-range forest plots",
      "geography": "Plot locations not verified in this review",
      "scanner": "Close-range sensing; see source publication",
      "spectral": false,
      "kind": "Plot clouds",
      "labels": "Ground, trunk, two branch orders, foliage, miscellany; tree and first-order-branch IDs; structural trait tables",
      "role": "Rights review",
      "readiness": "Derivatives deferred",
      "tasks": [
        "instances",
        "components",
        "geometry",
        "biomass"
      ],
      "conditional": [
        "instances",
        "components",
        "geometry",
        "biomass"
      ],
      "note": "Three point-cloud conversions were deliberately deferred for derivative-rights review. Acquisition is complete.",
      "correction": "Do not interpret acquired files as admitted training data. Keep the intended-use review explicit.",
      "provenance": "Recorded source license includes NC and ND terms; component and intended-use review is outstanding.",
      "review": {
        "reviewed_at": "2026-10-17",
        "scope": "Editorial source and metadata review; no new payload, rights or task admission",
        "observation_unit": "Three LAS plots with per-tree trait tables and first-order-branch references.",
        "source_facts": [
          {
            "text": "Tree identity is stored in point_source_id, component class in classification, and first-order-branch identity in gps_time; these LAS fields have dataset-specific meanings.",
            "url": "https://zenodo.org/records/15193973",
            "label": "Provider field definitions"
          },
          {
            "text": "Readme classes: 1 ground, 2 trunk, 3 first-order branch, 4 higher-order branch, 5 foliage, 6 miscellany. Tree/branch tables supply structural references.",
            "url": "https://zenodo.org/records/15193973/files/Readme.pdf",
            "label": "Provider Readme, sections 1–4"
          }
        ],
        "local_observations": [
          "All 11 selected assets were acquired; three cloud conversions remain deferred. Zero normalized files does not mean the source has no point clouds."
        ],
        "open_questions": [
          "Verify plot locations and acquisition details from the associated paper; this review does not establish their coordinates.",
          "Resolve intended-use and component terms before generating derivatives."
        ],
        "published_protocol": "No executable task-specific split or evaluator is admitted in this hub.",
        "observations_snapshot": {
          "source_metadata_sha256": "e8d372ca11a5067b7e572d092618edf7aa7339ee1679619bce8f79aac0134a31",
          "cloud_count": 0,
          "points": 0,
          "schemas": []
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "partial",
          "reason": "Native instance reference is described; plot coverage, boundary rules and adapter still require task review."
        },
        "components": {
          "status": "partial",
          "reason": "Native component labels are described; granularity, unknown classes and crosswalk losses remain task-specific."
        },
        "species": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "geometry": {
          "status": "partial",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "biomass": {
          "status": "partial",
          "reason": "Structural references or derived models require variable-level provenance; independent biomass truth is not established."
        }
      },
      "study_context": "No fixed local fitting/evaluation reservation is asserted by this catalog. Task and model exposure review still apply.",
      "id": "15193973",
      "title": "ForestSemantic: A Dataset for Semantic Learning of Forest from Close-Range Sensing",
      "url": "https://zenodo.org/records/15193973",
      "doi": "10.5281/zenodo.15193973",
      "version": "Pinned record",
      "license": "cc-by-nc-nd-4.0",
      "cloud_count": 0,
      "points": 0,
      "chunks": 0,
      "assets": 11,
      "source_fields": [],
      "schemas": [],
      "example_paths": [],
      "source_metadata_sha256": "e8d372ca11a5067b7e572d092618edf7aa7339ee1679619bce8f79aac0134a31",
      "coordinate_references": [],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 3,
      "discovery": {
        "unit": "plots",
        "unit_label": "Plot clouds",
        "instance_reference": {
          "status": "plots",
          "label": "Plot-level tree IDs reported"
        },
        "coverage": "Three source plots include tree and branch IDs, with structural reference tables.",
        "limitation": "Derivative preparation is deferred for intended-use and rights review.",
        "preparation": {
          "status": "blocked",
          "label": "Rights review required",
          "detail": "The existing derivative-rights gate remains closed.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 2595621534
    },
    {
      "name": "ForestSemantic-MS",
      "short": "ForestSemantic-MS",
      "modalities": [
        "Airborne"
      ],
      "domain": "Boreal forest plots",
      "geography": "Finland",
      "scanner": "FGI HeliALS multispectral system",
      "spectral": true,
      "kind": "Plot clouds",
      "labels": "Ground, low vegetation, trunk, branches, foliage, woody debris; no tree IDs",
      "role": "Published semantic benchmark",
      "readiness": "Partial crosswalk",
      "tasks": [
        "components",
        "geometry",
        "spectral"
      ],
      "conditional": [
        "components",
        "spectral"
      ],
      "note": "Six plots: four training and two test files. SWIR 1550 nm, NIR 905 nm, Green 532 nm; normalized reflectance and VI.",
      "correction": "Current coarse view does not map low vegetation or woody debris. Preserve both in a richer source namespace.",
      "provenance": "Potential relationships to other FGI collections require capture-level evidence; shared institutions do not prove overlap.",
      "review": {
        "reviewed_at": "2026-10-17",
        "scope": "Editorial source and metadata review; no new payload, rights or task admission",
        "observation_unit": "Six annotated multispectral plots: four training and two test plots.",
        "source_facts": [
          {
            "text": "HeliALS data include SWIR 1550 nm, NIR 905 nm, Green 532 nm and a vegetation index; the provider describes these channels as normalized to [0,1].",
            "url": "https://zenodo.org/records/17172162",
            "label": "Provider attributes"
          },
          {
            "text": "semantic_GT: 0 ground, 1 low vegetation, 2 trunk, 3 branches, 4 foliage, 5 woody debris. No individual-tree reference is documented.",
            "url": "https://zenodo.org/records/17172162",
            "label": "Provider labels and split"
          }
        ],
        "local_observations": [
          "All six normalized files retain native fields. The coarse view merges trunk/branches and leaves low vegetation/debris unknown."
        ],
        "open_questions": [
          "Recover the exact normalization and spatial alignment before spectral pooling.",
          "Resolve task treatment of low vegetation and fallen wood; retain native classes."
        ],
        "published_protocol": "The provider uses four plots for training and two for evaluation; this does not certify site separation.",
        "observations_snapshot": {
          "source_metadata_sha256": "bdf25852feed4b84da9b8c1b618de6a044f0fc9eeb5bba2f13b6f4e2ae3e87b2",
          "cloud_count": 6,
          "points": 9600927,
          "schemas": [
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "gps_time",
                "red",
                "green",
                "blue",
                "SWIR",
                "NIR",
                "Green",
                "VI",
                "semantic_GT"
              ],
              "files": 6
            }
          ]
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "unsupported",
          "reason": "Only semantic reference is documented; class IDs cannot supply tree identity."
        },
        "components": {
          "status": "partial",
          "reason": "Native component labels are described; granularity, unknown classes and crosswalk losses remain task-specific."
        },
        "species": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "geometry": {
          "status": "documented",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "partial",
          "reason": "Multispectral attributes are documented; radiometric equivalence across acquisitions is unverified."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        }
      },
      "study_context": "No fixed local fitting/evaluation reservation is asserted by this catalog. Task and model exposure review still apply.",
      "id": "17172162",
      "title": "ForestSemantic-MS Dataset: multispectral LiDAR forest point clouds for fine-grained forest semantic segmentation",
      "url": "https://zenodo.org/records/17172162",
      "doi": "10.5281/zenodo.17172162",
      "version": "v1",
      "license": "cc-by-4.0",
      "cloud_count": 6,
      "points": 9600927,
      "chunks": 23,
      "assets": 6,
      "source_fields": [
        "Green",
        "NIR",
        "SWIR",
        "VI",
        "X",
        "Y",
        "Z",
        "blue",
        "classification",
        "edge_of_flight_line",
        "gps_time",
        "green",
        "intensity",
        "key_point",
        "number_of_returns",
        "point_source_id",
        "red",
        "return_number",
        "scan_angle_rank",
        "scan_direction_flag",
        "semantic_GT",
        "synthetic",
        "user_data",
        "withheld"
      ],
      "schemas": [
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "gps_time",
            "red",
            "green",
            "blue",
            "SWIR",
            "NIR",
            "Green",
            "VI",
            "semantic_GT"
          ],
          "files": 6
        }
      ],
      "example_paths": [
        "sources/17172162/originals/test1.laz",
        "sources/17172162/originals/train3.laz",
        "sources/17172162/originals/test2.laz"
      ],
      "source_metadata_sha256": "bdf25852feed4b84da9b8c1b618de6a044f0fc9eeb5bba2f13b6f4e2ae3e87b2",
      "coordinate_references": [
        {
          "value": "Unknown / not recorded",
          "files": 6
        }
      ],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 0,
      "discovery": {
        "unit": "plots",
        "unit_label": "Plot clouds",
        "instance_reference": {
          "status": "none",
          "label": "No tree-instance labels documented"
        },
        "coverage": "Six plots have component labels; semantic classes do not identify individual trees.",
        "limitation": "Cannot supply the plot-instance reference required for segmentation accuracy.",
        "preparation": {
          "status": "tbd",
          "label": "Task pipeline TBD",
          "detail": "No self-contained whole-source pipeline has been audited for this plot-instance task.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 131104665
    },
    {
      "name": "FGI-EMIT",
      "short": "FGI-EMIT",
      "modalities": [
        "Airborne"
      ],
      "domain": "Forest and mixed-object plots",
      "geography": "Espoonlahti, Espoo, Finland",
      "scanner": "Multispectral high-density airborne laser scanning",
      "spectral": true,
      "kind": "Plot clouds",
      "labels": "Tree instances; other, tree, building, vehicle, pole, out",
      "role": "Published instance benchmark",
      "readiness": "Audited source-specific preparation",
      "tasks": [
        "instances",
        "geometry",
        "spectral"
      ],
      "conditional": [
        "instances",
        "spectral"
      ],
      "note": "Native classes include built objects. The local study uses only selected test plots; the provider also supplies training data.",
      "correction": "Retain native categories and the out mask. Do not infer wood/foliage labels from the broad tree category.",
      "provenance": "Single Espoonlahti acquisition area; split plots do not by themselves establish geographic generalization.",
      "study_context": "The local forestseg study reserves its selected test plots for terminal evaluation. This reservation is not a provider-wide restriction.",
      "review": {
        "reviewed_at": "2026-10-20",
        "scope": "Full provider archive checksums, all 19 original payload SHA256, every point and independent prepared-array validation; no model/evaluator/calibration certification",
        "observation_unit": "19 cylindrical plots; tree_index is unique within each plot.",
        "source_facts": [
          {
            "text": "The Espoonlahti acquisition contains 19 plots and 1,561 annotated trees. It also contains buildings, vehicles and poles. Tree annotation targets identifiable trees at least 3 m high and boundary trees approximately half inside.",
            "label": "Pinned provider description, sections 1 and 3",
            "url": "https://zenodo.org/records/19351234"
          },
          {
            "text": "Native classification: 0 other, 1 tree, 2 building, 3 vehicle, 4 pole, 5 out. The source benchmark excludes class 5; its unsupervised and learned methods treat classes 2–4 differently.",
            "label": "Pinned provider description, section 3.1",
            "url": "https://zenodo.org/records/19351234"
          },
          {
            "text": "Three source scanners have wavelengths 1550, 905 and 532 nm. Each channel has its own missing-value convention. The RGB descriptions disagree between metadata.yaml and public Table 4.",
            "label": "Provider scanner and attribute description",
            "url": "https://research.aalto.fi/en/datasets/fgi-emit-a-multispectral-high-density-airborne-laser-scanning-ben/"
          }
        ],
        "local_observations": [
          "19 normalized LAS files retain radiometric attributes and native classes. The coarse instance view masks out-points without deleting source points.",
          "All 19 native headers share one 39-field schema and contain no CRS. Their point counts sum to 60,793,586; source payload hashes were not recomputed in this audit.",
          "190,000 stored-order prefix points were inspected. Suffix fields retain documented sentinels; the finite numeric zero is missing for intensity/amplitude, while reference tree_index zero means no assigned instance.",
          "All suffix-channel headers report nearest-neighbor association within 0.25 m. This describes association provenance, not validated co-registration or calibration.",
          "2026-10-20 full-source audit and adapter validation cover 60,793,586 points, 1,561 native instances and both official partitions. Class 0/5 remain unknown; native reflectance masks are explicit."
        ],
        "open_questions": [
          "Choose the evaluator-specific boundary/background policy before comparing scores.",
          "Review channel calibration and model exposure to Espoonlahti.",
          "Resolve RGB intensity-versus-reflectance descriptions and suffix-field units/scaling before treating them as quantitative features."
        ],
        "published_protocol": "13 training and 6 test plots; optional validation plots 1019, 1022, 1031 come from training. These are plots from one acquisition area, not 19 independent zones.",
        "observations_snapshot": {
          "source_metadata_sha256": "d60fb6fab63dfbcb1bd9d815059909b5626a918e8c5cbf2d79623677223cf720",
          "cloud_count": 19,
          "points": 60793586,
          "schemas": [
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "synthetic",
                "key_point",
                "withheld",
                "overlap",
                "scanner_channel",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "user_data",
                "scan_angle",
                "point_source_id",
                "gps_time",
                "red",
                "green",
                "blue",
                "Amplitude",
                "Reflectance",
                "Deviation",
                "reflectance_1",
                "reflectance_2",
                "reflectance_3",
                "amplitude_1",
                "amplitude_2",
                "amplitude_3",
                "deviation_1",
                "deviation_2",
                "deviation_3",
                "intensity_1",
                "intensity_2",
                "intensity_3",
                "tree_index",
                "edge",
                "dead"
              ],
              "files": 19
            }
          ]
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "partial",
          "reason": "An independently validated conservative task adapter preserves all points, original IDs, official partitions and native spectral channels; article scoring and geographic transfer remain separate."
        },
        "components": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "species": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "geometry": {
          "status": "documented",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "partial",
          "reason": "Multispectral attributes are documented; radiometric equivalence across acquisitions is unverified."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        }
      },
      "id": "19351234",
      "title": "FGI-EMIT: a multispectral high-density airborne laser scanning benchmark dataset for individual tree segmentation",
      "url": "https://zenodo.org/records/19351234",
      "doi": "10.5281/zenodo.19351234",
      "version": "Pinned record",
      "license": "cc-by-nc-sa-4.0",
      "cloud_count": 19,
      "points": 60793586,
      "chunks": 132,
      "assets": 5,
      "source_fields": [
        "Amplitude",
        "Deviation",
        "Reflectance",
        "X",
        "Y",
        "Z",
        "amplitude_1",
        "amplitude_2",
        "amplitude_3",
        "blue",
        "classification",
        "dead",
        "deviation_1",
        "deviation_2",
        "deviation_3",
        "edge",
        "edge_of_flight_line",
        "gps_time",
        "green",
        "intensity",
        "intensity_1",
        "intensity_2",
        "intensity_3",
        "key_point",
        "number_of_returns",
        "overlap",
        "point_source_id",
        "red",
        "reflectance_1",
        "reflectance_2",
        "reflectance_3",
        "return_number",
        "scan_angle",
        "scan_direction_flag",
        "scanner_channel",
        "synthetic",
        "tree_index",
        "user_data",
        "withheld"
      ],
      "schemas": [
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "synthetic",
            "key_point",
            "withheld",
            "overlap",
            "scanner_channel",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "user_data",
            "scan_angle",
            "point_source_id",
            "gps_time",
            "red",
            "green",
            "blue",
            "Amplitude",
            "Reflectance",
            "Deviation",
            "reflectance_1",
            "reflectance_2",
            "reflectance_3",
            "amplitude_1",
            "amplitude_2",
            "amplitude_3",
            "deviation_1",
            "deviation_2",
            "deviation_3",
            "intensity_1",
            "intensity_2",
            "intensity_3",
            "tree_index",
            "edge",
            "dead"
          ],
          "files": 19
        }
      ],
      "example_paths": [
        "sources/19351234/originals/test/test/plot_1002.las",
        "sources/19351234/originals/test/test/plot_1004.las",
        "sources/19351234/originals/test/test/plot_1008.las"
      ],
      "source_metadata_sha256": "d60fb6fab63dfbcb1bd9d815059909b5626a918e8c5cbf2d79623677223cf720",
      "coordinate_references": [
        {
          "value": "Unknown / not recorded",
          "files": 19
        }
      ],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 0,
      "discovery": {
        "unit": "plots",
        "unit_label": "Plot clouds",
        "instance_reference": {
          "status": "plots",
          "label": "Plot-level tree IDs reported"
        },
        "coverage": "Annotations target identifiable trees at least 3 m high and qualifying boundary trees.",
        "limitation": "Boundary masks and background treatment must match the chosen protocol.",
        "preparation": {
          "status": "ready",
          "label": "Audited geometry, instances and native spectral masks",
          "detail": "All 19 original LAS files and 60,793,586 points passed full integrity and source-specific preparation validation. Native spectral units, calibration, annotation completeness and geographic independence remain unresolved.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 2445009717,
      "native_measurement_contracts": [
        {
          "id": "contract:fgi-emit-native:1.0.0",
          "name": "FGI-EMIT native multispectral LAS plot",
          "version": "1.0.0",
          "status": "documented_and_header_observed",
          "format": "LAS 1.4 point format 7",
          "observation_unit": "One native plot; 19 headers and 10000 prefix points per plot inspected, without full-payload or task validation.",
          "fields": [
            {
              "name": "X",
              "dtypes": [
                "int32"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Stored coordinate integer decoded with this axis LAS scale and offset; no CRS is supplied.",
              "required": true,
              "role": "coordinate"
            },
            {
              "name": "Y",
              "dtypes": [
                "int32"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Stored coordinate integer decoded with this axis LAS scale and offset; no CRS is supplied.",
              "required": true,
              "role": "coordinate"
            },
            {
              "name": "Z",
              "dtypes": [
                "int32"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Stored coordinate integer decoded with this axis LAS scale and offset; no CRS is supplied.",
              "required": true,
              "role": "coordinate"
            },
            {
              "name": "intensity",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "return_number",
              "dtypes": [
                "uint4"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "number_of_returns",
              "dtypes": [
                "uint4"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "synthetic",
              "dtypes": [
                "uint1"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "key_point",
              "dtypes": [
                "uint1"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "withheld",
              "dtypes": [
                "uint1"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "overlap",
              "dtypes": [
                "uint1"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "scanner_channel",
              "dtypes": [
                "uint2"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "scan_direction_flag",
              "dtypes": [
                "uint1"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "edge_of_flight_line",
              "dtypes": [
                "uint1"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "classification",
              "dtypes": [
                "uint8"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Manually generated semantic annotation. Intended for removing particular types of objects from the data.",
              "required": true,
              "role": "reference"
            },
            {
              "name": "user_data",
              "dtypes": [
                "uint8"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Origin scanner ID: 1, 2 or 3. This is distinct from the packed LAS scanner_channel field.",
              "required": true,
              "role": "provenance"
            },
            {
              "name": "scan_angle",
              "dtypes": [
                "int16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "point_source_id",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "gps_time",
              "dtypes": [
                "float64"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Native LAS attribute retained without a task-specific interpretation.",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "red",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Pseudo color from scanner 1. YAML says scaled intensity; public Table 4 says scaled reflectance. Physical quantity and scaling are unresolved.",
              "required": true,
              "role": "display",
              "measurement": {
                "quantity": "pseudocolor",
                "semantic_status": "conflicting",
                "channel_ref": "channel:fgi-emit-scanner-1:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Display encoding; physical quantity and scaling unresolved."
                },
                "missingness": {
                  "status": "not_documented",
                  "values": [],
                  "detail": "YAML NULL means no sentinel is specified. Zero must not be treated as a missing-value rule."
                },
                "association": {
                  "method": "not_documented",
                  "max_distance_m": null,
                  "status": "not_documented",
                  "detail": "The RGB mapping and alignment are not established by this audit."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-description",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "green",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Pseudo color from scanner 2. YAML says scaled intensity; public Table 4 says scaled reflectance. Physical quantity and scaling are unresolved.",
              "required": true,
              "role": "display",
              "measurement": {
                "quantity": "pseudocolor",
                "semantic_status": "conflicting",
                "channel_ref": "channel:fgi-emit-scanner-2:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Display encoding; physical quantity and scaling unresolved."
                },
                "missingness": {
                  "status": "not_documented",
                  "values": [],
                  "detail": "YAML NULL means no sentinel is specified. Zero must not be treated as a missing-value rule."
                },
                "association": {
                  "method": "not_documented",
                  "max_distance_m": null,
                  "status": "not_documented",
                  "detail": "The RGB mapping and alignment are not established by this audit."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-description",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "blue",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Pseudo color from scanner 3. YAML says scaled intensity; public Table 4 says scaled reflectance. Physical quantity and scaling are unresolved.",
              "required": true,
              "role": "display",
              "measurement": {
                "quantity": "pseudocolor",
                "semantic_status": "conflicting",
                "channel_ref": "channel:fgi-emit-scanner-3:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Display encoding; physical quantity and scaling unresolved."
                },
                "missingness": {
                  "status": "not_documented",
                  "values": [],
                  "detail": "YAML NULL means no sentinel is specified. Zero must not be treated as a missing-value rule."
                },
                "association": {
                  "method": "not_documented",
                  "max_distance_m": null,
                  "status": "not_documented",
                  "detail": "The RGB mapping and alignment are not established by this audit."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-description",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "Amplitude",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Echo signal amplitude [dB]",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "Reflectance",
              "dtypes": [
                "int16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Echo signal reflectance [dB]",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "Deviation",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Pulse shape deviation",
              "required": true,
              "role": "native_attribute"
            },
            {
              "name": "reflectance_1",
              "dtypes": [
                "float32"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided reflectance associated from scanner 1; native header: VUX nn.refl., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "reflectance",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-1:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    -9999
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "reflectance_2",
              "dtypes": [
                "float32"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided reflectance associated from scanner 2; native header: miniVUX nn.refl., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "reflectance",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-2:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    -9999
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "reflectance_3",
              "dtypes": [
                "float32"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided reflectance associated from scanner 3; native header: VQ840G nn.refl., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "reflectance",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-3:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    -9999
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "amplitude_1",
              "dtypes": [
                "float32"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided amplitude associated from scanner 1; native header: VUX nn.amp., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "amplitude",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-1:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    0
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "amplitude_2",
              "dtypes": [
                "float32"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided amplitude associated from scanner 2; native header: miniVUX nn.amp., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "amplitude",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-2:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    0
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "amplitude_3",
              "dtypes": [
                "float32"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided amplitude associated from scanner 3; native header: VQ840G nn.amp., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "amplitude",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-3:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    0
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "deviation_1",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided echo_deviation associated from scanner 1; native header: VUX nn.echdev., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "echo_deviation",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-1:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    65535
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "deviation_2",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided echo_deviation associated from scanner 2; native header: miniVUX nn.echdev., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "echo_deviation",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-2:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    65535
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "deviation_3",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided echo_deviation associated from scanner 3; native header: VQ840G nn.echdev., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "echo_deviation",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-3:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    65535
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "intensity_1",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided intensity associated from scanner 1; native header: VUX nn.int., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "intensity",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-1:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    0
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "intensity_2",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided intensity associated from scanner 2; native header: miniVUX nn.int., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "intensity",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-2:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    0
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "intensity_3",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Source-provided intensity associated from scanner 3; native header: VQ840G nn.int., r=0.25m.",
              "required": true,
              "role": "measurement",
              "measurement": {
                "quantity": "intensity",
                "semantic_status": "documented",
                "channel_ref": "channel:fgi-emit-scanner-3:1.0.0",
                "unit": {
                  "symbol": null,
                  "status": "unknown",
                  "detail": "Suffix-field unit and scaling are not established by metadata.yaml or the LAS header; do not inherit units from similarly named base fields."
                },
                "missingness": {
                  "status": "documented_sentinel",
                  "values": [
                    0
                  ],
                  "detail": "Provider metadata sentinel; validity requires both finiteness and inequality to the sentinel. No imputation is admitted."
                },
                "association": {
                  "method": "nearest_neighbor",
                  "max_distance_m": 0.25,
                  "status": "header_reported",
                  "detail": "Reported by every inspected LAS extra-dimension description. Spatial association accuracy is not validated."
                },
                "evidence_refs": [
                  "evidence:fgi-emit-metadata",
                  "evidence:fgi-emit-measurements-20261019"
                ]
              }
            },
            {
              "name": "tree_index",
              "dtypes": [
                "uint16"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Plot-local instance reference; 0 means no assigned tree instance. The metadata missing_val 0 must not be interpreted as missing sensor data or proof of annotation completeness.",
              "required": true,
              "role": "reference"
            },
            {
              "name": "edge",
              "dtypes": [
                "uint8"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Tree instances on the edge of the plot with some parts missing have this value set to 1 for all points. All other points have this value set to 0.",
              "required": true,
              "role": "reference"
            },
            {
              "name": "dead",
              "dtypes": [
                "uint8"
              ],
              "shape": [
                "N"
              ],
              "meaning": "Tree instances identified as dead via visual inspection have this value set to 1 for all points. All other points have this value set to 0.",
              "required": true,
              "role": "reference"
            }
          ],
          "coordinate_ref": "coordinates:fgi-emit-source:1.0.0",
          "partitioning": "Retain the source 13 train / 6 test directories. Optional validation plots 1019, 1022 and 1031 belong to training; no new split is applied.",
          "annotation_codes": [
            {
              "field": "classification",
              "code": 0,
              "meaning": "Other, including ground and understory; not a terrain-only class"
            },
            {
              "field": "classification",
              "code": 1,
              "meaning": "Tree instance"
            },
            {
              "field": "classification",
              "code": 2,
              "meaning": "Building"
            },
            {
              "field": "classification",
              "code": 3,
              "meaning": "Vehicle"
            },
            {
              "field": "classification",
              "code": 4,
              "meaning": "Pole"
            },
            {
              "field": "classification",
              "code": 5,
              "meaning": "Out-of-plot trees without instance annotation"
            }
          ],
          "invariants": [
            "The origin scanner is encoded by user_data with values 1/2/3, not by LAS scanner_channel.",
            "Instance zero is an annotation convention; sensor sentinels do not define instance-reference validity.",
            "Keep all native fields and points; no class shift, dropping, coordinate recentering, imputation or radiometric normalization is admitted.",
            "Prefix counts describe only sampled stored-order prefixes; no whole-source completeness or channel co-observation is certified.",
            "Calibration, association accuracy, RGB quantity and physical suffix-field units remain unresolved."
          ],
          "evidence_refs": [
            "evidence:fgi-emit-metadata",
            "evidence:fgi-emit-official",
            "evidence:fgi-emit-description",
            "evidence:fgi-emit-measurements-20261019"
          ],
          "channels": [
            {
              "id": "channel:fgi-emit-scanner-1:1.0.0",
              "name": "FGI-EMIT scanner 1",
              "version": "1.0.0",
              "source_ref": "zenodo:19351234",
              "scanner_id": 1,
              "sensor_model": "RIEGL VUX-1HA",
              "wavelength_nm": 1550,
              "calibration": {
                "status": "not_verified",
                "detail": "No radiometric calibration, scaling or cross-source comparability is validated by this header and prefix audit."
              },
              "evidence_refs": [
                "evidence:fgi-emit-official",
                "evidence:fgi-emit-description",
                "evidence:fgi-emit-measurements-20261019"
              ]
            },
            {
              "id": "channel:fgi-emit-scanner-2:1.0.0",
              "name": "FGI-EMIT scanner 2",
              "version": "1.0.0",
              "source_ref": "zenodo:19351234",
              "scanner_id": 2,
              "sensor_model": "RIEGL miniVUX-1DL",
              "wavelength_nm": 905,
              "calibration": {
                "status": "not_verified",
                "detail": "No radiometric calibration, scaling or cross-source comparability is validated by this header and prefix audit."
              },
              "evidence_refs": [
                "evidence:fgi-emit-official",
                "evidence:fgi-emit-description",
                "evidence:fgi-emit-measurements-20261019"
              ]
            },
            {
              "id": "channel:fgi-emit-scanner-3:1.0.0",
              "name": "FGI-EMIT scanner 3",
              "version": "1.0.0",
              "source_ref": "zenodo:19351234",
              "scanner_id": 3,
              "sensor_model": "RIEGL VQ-840-G",
              "wavelength_nm": 532,
              "calibration": {
                "status": "not_verified",
                "detail": "No radiometric calibration, scaling or cross-source comparability is validated by this header and prefix audit."
              },
              "evidence_refs": [
                "evidence:fgi-emit-official",
                "evidence:fgi-emit-description",
                "evidence:fgi-emit-measurements-20261019"
              ]
            }
          ]
        }
      ],
      "class_semantics": [
        {
          "code": "0",
          "term": "other",
          "evidence_ref": "evidence:35d3dc9ef0e54211d26b6c35"
        },
        {
          "code": "1",
          "term": "tree",
          "evidence_ref": "evidence:35d3dc9ef0e54211d26b6c35"
        },
        {
          "code": "2",
          "term": "building",
          "evidence_ref": "evidence:35d3dc9ef0e54211d26b6c35"
        },
        {
          "code": "3",
          "term": "vehicle",
          "evidence_ref": "evidence:35d3dc9ef0e54211d26b6c35"
        },
        {
          "code": "4",
          "term": "pole",
          "evidence_ref": "evidence:35d3dc9ef0e54211d26b6c35"
        },
        {
          "code": "5",
          "term": "out",
          "evidence_ref": "evidence:35d3dc9ef0e54211d26b6c35"
        }
      ]
    },
    {
      "name": "EvoMS",
      "short": "EvoMS",
      "modalities": [
        "Airborne"
      ],
      "domain": "Boreal forest plots",
      "geography": "Evo, Finland",
      "scanner": "Multispectral LiDAR, 1550 / 905 / 532 nm",
      "spectral": true,
      "kind": "Plot clouds",
      "labels": "Plots 1–2: tree instances, foliage, wood, understory; 18 unlabeled plots",
      "role": "Partial-label spectral dataset",
      "readiness": "Partial supervision",
      "tasks": [
        "instances",
        "components",
        "geometry",
        "spectral"
      ],
      "conditional": [
        "instances",
        "components",
        "spectral"
      ],
      "note": "Two plots supply instance/component reference. The provider cylinder split and the local plot reservation are different protocols.",
      "correction": "Use z as the supplied terrain-normalized height. Retain understory as a native class and preserve the 18 unlabeled plots as unlabeled.",
      "provenance": "One Evo acquisition area; labeled and unlabeled subsets do not constitute independent geographic domains.",
      "study_context": "The local forestseg study reserves plots 1–2 for terminal evaluation and excludes plots 3–20 from fitting. The source paper used unlabeled data for training.",
      "review": {
        "reviewed_at": "2026-10-17",
        "scope": "Editorial source and metadata review; no new payload, rights or task admission",
        "observation_unit": "20 plots from the Evo acquisition; only plots 1 and 2 have manual labels.",
        "source_facts": [
          {
            "text": "Ground points were removed and a terrain model was already subtracted from z. The 18 other plots have no manual labels.",
            "url": "https://zenodo.org/records/15913427",
            "label": "Provider preprocessing and label coverage"
          },
          {
            "text": "Labeled plots carry tree_index and classification: 0 foliage, 1 wood, 2 understory. red/green/blue store scanner reflectances at 1550/905/532 nm, rather than visible RGB.",
            "url": "https://zenodo.org/records/15913427",
            "label": "Provider attributes"
          },
          {
            "text": "The published experiment splits overlapping cylinders, including selected test cylinders inside plots 1 and 2; remaining cylinders were used for training.",
            "url": "https://zenodo.org/records/15913427",
            "label": "Provider data-split table"
          }
        ],
        "local_observations": [
          "The saved schemas distinguish 2 files with tree_index from 18 without it. The coarse view leaves understory unknown and preserves it natively."
        ],
        "open_questions": [
          "Recover cylinder geometry, overlap and model exposure when reproducing the published experiment.",
          "Calibrate radiometry before cross-source transfer; do not normalize terrain a second time."
        ],
        "published_protocol": "The provider cylinder split differs from the local study, which reserves both labeled plots and excludes the 18 unlabeled plots from fitting.",
        "observations_snapshot": {
          "source_metadata_sha256": "e9008d5079b8e230288bc7e28e22eb819aa85aa81f063c098913c9e36e29f7b3",
          "cloud_count": 20,
          "points": 128533887,
          "schemas": [
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "synthetic",
                "key_point",
                "withheld",
                "overlap",
                "scanner_channel",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "user_data",
                "scan_angle",
                "point_source_id",
                "gps_time",
                "red",
                "green",
                "blue"
              ],
              "files": 18
            },
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "synthetic",
                "key_point",
                "withheld",
                "overlap",
                "scanner_channel",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "user_data",
                "scan_angle",
                "point_source_id",
                "gps_time",
                "red",
                "green",
                "blue",
                "tree_index"
              ],
              "files": 2
            }
          ]
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "partial",
          "reason": "Native instance reference is described; plot coverage, boundary rules and adapter still require task review."
        },
        "components": {
          "status": "partial",
          "reason": "Native component labels are described; granularity, unknown classes and crosswalk losses remain task-specific."
        },
        "species": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "geometry": {
          "status": "documented",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "partial",
          "reason": "Multispectral attributes are documented; radiometric equivalence across acquisitions is unverified."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        }
      },
      "id": "15913427",
      "title": "EvoMS: multispectral LiDAR forest point clouds with partial semantic annotations",
      "url": "https://zenodo.org/records/15913427",
      "doi": "10.5281/zenodo.15913427",
      "version": "Pinned record",
      "license": "cc-by-nc-sa-4.0",
      "cloud_count": 20,
      "points": 128533887,
      "chunks": 266,
      "assets": 20,
      "source_fields": [
        "X",
        "Y",
        "Z",
        "blue",
        "classification",
        "edge_of_flight_line",
        "gps_time",
        "green",
        "intensity",
        "key_point",
        "number_of_returns",
        "overlap",
        "point_source_id",
        "red",
        "return_number",
        "scan_angle",
        "scan_direction_flag",
        "scanner_channel",
        "synthetic",
        "tree_index",
        "user_data",
        "withheld"
      ],
      "schemas": [
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "synthetic",
            "key_point",
            "withheld",
            "overlap",
            "scanner_channel",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "user_data",
            "scan_angle",
            "point_source_id",
            "gps_time",
            "red",
            "green",
            "blue"
          ],
          "files": 18
        },
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "synthetic",
            "key_point",
            "withheld",
            "overlap",
            "scanner_channel",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "user_data",
            "scan_angle",
            "point_source_id",
            "gps_time",
            "red",
            "green",
            "blue",
            "tree_index"
          ],
          "files": 2
        }
      ],
      "example_paths": [
        "sources/15913427/originals/plot_4.las",
        "sources/15913427/originals/plot_3.las",
        "sources/15913427/originals/plot_1.las"
      ],
      "source_metadata_sha256": "e9008d5079b8e230288bc7e28e22eb819aa85aa81f063c098913c9e36e29f7b3",
      "coordinate_references": [
        {
          "value": "Unknown / not recorded",
          "files": 20
        }
      ],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 0,
      "discovery": {
        "unit": "plots",
        "unit_label": "Plot clouds",
        "instance_reference": {
          "status": "plots",
          "label": "Only 2 of 20 plots labeled"
        },
        "coverage": "Plots 1–2 have manual instances; the other 18 are unlabeled. Ground was removed and height normalized.",
        "limitation": "Do not normalize terrain again; the published cylinder split is a distinct protocol.",
        "preparation": {
          "status": "tbd",
          "label": "Task pipeline TBD",
          "detail": "No self-contained whole-source pipeline has been audited for this plot-instance task.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 4643758820
    },
    {
      "name": "TreeScanPL10K",
      "short": "TreeScanPL10K",
      "modalities": [
        "Terrestrial"
      ],
      "domain": "Central European forest inventories",
      "geography": "Poland; location precision is limited",
      "scanner": "FARO Focus 3D X130 · Trimble TX5",
      "spectral": false,
      "kind": "Plot clouds",
      "labels": "Plot-local treeID; treeSP with partial species coverage; completelyInside crown flag",
      "role": "Instance and species candidate",
      "readiness": "Coverage review",
      "tasks": [
        "instances",
        "species",
        "geometry"
      ],
      "conditional": [
        "instances",
        "species"
      ],
      "note": "272 plots. Completeness and boundary flags matter for evaluation. Species fields require a verified lookup table.",
      "correction": "Rounded locations do not certify site separation. This source dominates the collection by point count.",
      "provenance": "Conservative campaign/site grouping is needed; per-file instance IDs are not globally unique.",
      "review": {
        "reviewed_at": "2026-10-17",
        "scope": "Editorial source and metadata review; no new payload, rights or task admission",
        "observation_unit": "272 circular TLS plots (15 m radius); tree identity is plot-local.",
        "source_facts": [
          {
            "text": "The provider reports 10,417 trees, with species labels for 7,465 across 30 species. treeSP=0 conflates non-tree points and unknown species; completelyInside marks complete versus cropped crowns.",
            "url": "https://zenodo.org/records/19127709",
            "label": "Provider annotation coverage"
          },
          {
            "text": "Six Polish forest districts were scanned using FARO Focus 3D X130 and Trimble TX5. species_id.csv gives the taxonomic lookup; plot_summary.csv locations are rounded to a kilometer.",
            "url": "https://zenodo.org/records/19127709",
            "label": "Provider acquisition and companion tables"
          }
        ],
        "local_observations": [
          "272 normalized plots retain treeID, treeSP, PointID and completelyInside. The coarse normalizer does not establish wood/foliage semantics."
        ],
        "open_questions": [
          "Join species_id.csv and preserve unknown species; the label coverage percentage describes trees, not points.",
          "Group campaigns and nearby plots conservatively; rounded coordinates cannot certify separation."
        ],
        "published_protocol": "No frozen train/validation/test protocol for this source has been admitted by the hub.",
        "observations_snapshot": {
          "source_metadata_sha256": "2e22e773cebdd3c81b82c3ee2a1d5ed1c98fc5ff8b09d76e885ba3dc36d5f249",
          "cloud_count": 272,
          "points": 18762160941,
          "schemas": [
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "gps_time",
                "red",
                "green",
                "blue",
                "PointID",
                "treeID",
                "treeSP",
                "completelyInside"
              ],
              "files": 51
            },
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "PointID",
                "treeID",
                "treeSP",
                "completelyInside"
              ],
              "files": 221
            }
          ]
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "partial",
          "reason": "Native instance reference is described; plot coverage, boundary rules and adapter still require task review."
        },
        "components": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "species": {
          "status": "partial",
          "reason": "Species reference is partial; retain unknowns and verify the per-source lookup and tree linkage."
        },
        "geometry": {
          "status": "documented",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        }
      },
      "study_context": "No fixed local fitting/evaluation reservation is asserted by this catalog. Task and model exposure review still apply.",
      "id": "19127709",
      "title": "TreeScanPL10k: A Central European tree species dataset of annotated terrestrial laser scanning point clouds",
      "url": "https://zenodo.org/records/19127709",
      "doi": "10.5281/zenodo.19127709",
      "version": "Pinned record",
      "license": "cc-by-4.0",
      "cloud_count": 272,
      "points": 18762160941,
      "chunks": 37655,
      "assets": 31,
      "source_fields": [
        "PointID",
        "X",
        "Y",
        "Z",
        "blue",
        "classification",
        "completelyInside",
        "edge_of_flight_line",
        "gps_time",
        "green",
        "intensity",
        "key_point",
        "number_of_returns",
        "point_source_id",
        "red",
        "return_number",
        "scan_angle_rank",
        "scan_direction_flag",
        "synthetic",
        "treeID",
        "treeSP",
        "user_data",
        "withheld"
      ],
      "schemas": [
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "gps_time",
            "red",
            "green",
            "blue",
            "PointID",
            "treeID",
            "treeSP",
            "completelyInside"
          ],
          "files": 51
        },
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "PointID",
            "treeID",
            "treeSP",
            "completelyInside"
          ],
          "files": 221
        }
      ],
      "example_paths": [
        "sources/19127709/originals/batch_28/Rem_Suprasl_2015_4502004.laz",
        "sources/19127709/originals/batch_28/Rem_Suprasl_2015_4601204.laz",
        "sources/19127709/originals/batch_03/Rem_Gorlice_2015_6004603.laz"
      ],
      "source_metadata_sha256": "2e22e773cebdd3c81b82c3ee2a1d5ed1c98fc5ff8b09d76e885ba3dc36d5f249",
      "coordinate_references": [
        {
          "value": "Unknown / not recorded",
          "files": 272
        }
      ],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 0,
      "discovery": {
        "unit": "plots",
        "unit_label": "Plot clouds",
        "instance_reference": {
          "status": "plots",
          "label": "Plot-level tree IDs reported"
        },
        "coverage": "Plot-local IDs include a complete/cropped crown flag; species labels cover only some trees.",
        "limitation": "Rounded locations do not establish independent evaluation zones.",
        "preparation": {
          "status": "tbd",
          "label": "Task pipeline TBD",
          "detail": "No self-contained whole-source pipeline has been audited for this plot-instance task.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 94420538633
    },
    {
      "name": "Four-site TLS benchmark",
      "short": "TLS benchmark",
      "modalities": [
        "Terrestrial"
      ],
      "domain": "Savanna · temperate · tropical forest",
      "geography": "Litchfield · Wytham · Ofental · Robson Creek",
      "scanner": "RIEGL VZ-series",
      "spectral": false,
      "kind": "Plots + extracted trees",
      "labels": "Plot-level ground/tree semantics and instances; extracted-tree exports vary",
      "role": "Four-site instance benchmark",
      "readiness": "Overlap review",
      "tasks": [
        "instances",
        "geometry"
      ],
      "conditional": [
        "instances"
      ],
      "note": "Plot references and derived tree exports are different evaluation units. The validated frozen Wytham run covers only one diagnostic export.",
      "correction": "118 byte-identical train/validation tree copies; Wytham also overlaps the separate Wytham collection.",
      "provenance": "Provider documents boundary duplication. Site-level grouping must include all derived tree exports.",
      "review": {
        "reviewed_at": "2026-10-17",
        "scope": "Editorial source and metadata review; no new payload, rights or task admission",
        "observation_unit": "Four physical plots, spatial train/validation/test areas, and derived individual-tree exports.",
        "source_facts": [
          {
            "text": "Litchfield, Wytham, Ofental and Robson Creek cover savanna, temperate and tropical forests. Plot PLYs use semantic 0 ground / 1 tree and instance IDs; individual-tree exports vary.",
            "url": "https://zenodo.org/records/16875688",
            "label": "Provider format and sites"
          },
          {
            "text": "Trees crossing area boundaries are included in multiple folders. The provider supplies finetuned TreeLearn and ForAINet weights; folder separation does not imply independent tree samples.",
            "url": "https://zenodo.org/records/16875688",
            "label": "Provider duplication and weights notes"
          }
        ],
        "local_observations": [
          "3,271 normalized files combine plot clouds and extracted trees. Recorded hashes identify 118 extra tree copies across train/validation and 280 across this record and Wytham."
        ],
        "open_questions": [
          "Resolve each checkpoint training and model-selection exposure.",
          "Retain plot-area boundary policies and group all derivatives of the same capture."
        ],
        "published_protocol": "Spatial areas within four sites support the provider protocol. Independent-zone evaluation requires an explicit held-out site and reviewed checkpoint exposure.",
        "observations_snapshot": {
          "source_metadata_sha256": "534392f8da7ed9d1f5470eaee4c9220f95ba8975f52cc80a434949727e0cbb42",
          "cloud_count": 3271,
          "points": 1577458464,
          "schemas": [
            {
              "fields": [
                "x",
                "y",
                "z",
                "semantic",
                "instance"
              ],
              "files": 2473
            },
            {
              "fields": [
                "x",
                "y",
                "z"
              ],
              "files": 776
            },
            {
              "fields": [
                "x",
                "y",
                "z",
                "red",
                "green",
                "blue",
                "instance",
                "semantic"
              ],
              "files": 12
            },
            {
              "fields": [
                "x",
                "y",
                "z",
                "instance",
                "semantic"
              ],
              "files": 10
            }
          ]
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "partial",
          "reason": "Native instance reference is described; plot coverage, boundary rules and adapter still require task review."
        },
        "components": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "species": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "geometry": {
          "status": "documented",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        }
      },
      "study_context": "No fixed local fitting/evaluation reservation is asserted by this catalog. Task and model exposure review still apply.",
      "id": "16875688",
      "title": "TLS forest instance segmentation benchmark: 2983 manually segmented trees from four plots",
      "url": "https://zenodo.org/records/16875688",
      "doi": "10.5281/zenodo.16875688",
      "version": "Pinned record",
      "license": "cc-by-4.0",
      "cloud_count": 3271,
      "points": 1577458464,
      "chunks": 5573,
      "assets": 10,
      "source_fields": [
        "blue",
        "green",
        "instance",
        "red",
        "semantic",
        "x",
        "y",
        "z"
      ],
      "schemas": [
        {
          "fields": [
            "x",
            "y",
            "z",
            "semantic",
            "instance"
          ],
          "files": 2473
        },
        {
          "fields": [
            "x",
            "y",
            "z"
          ],
          "files": 776
        },
        {
          "fields": [
            "x",
            "y",
            "z",
            "red",
            "green",
            "blue",
            "instance",
            "semantic"
          ],
          "files": 12
        },
        {
          "fields": [
            "x",
            "y",
            "z",
            "instance",
            "semantic"
          ],
          "files": 10
        }
      ],
      "example_paths": [
        "sources/16875688/originals/litchfield/litchfield_train.ply",
        "sources/16875688/originals/litchfield/trees/test/in_plot_th0.90/tile_0_-20_Boom1.ply",
        "sources/16875688/originals/litchfield/trees/test/in_plot_th0.90/tile_0_-20_Boom10.ply"
      ],
      "source_metadata_sha256": "534392f8da7ed9d1f5470eaee4c9220f95ba8975f52cc80a434949727e0cbb42",
      "coordinate_references": [
        {
          "value": "Unknown / not recorded",
          "files": 3271
        }
      ],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 0,
      "discovery": {
        "unit": "mixed",
        "unit_label": "Plots + tree exports",
        "instance_reference": {
          "status": "plots",
          "label": "Plot labels; tree exports vary"
        },
        "coverage": "Four physical plots have spatial split areas and derived tree exports, including XYZ-only files.",
        "limitation": "Boundary trees repeat across folders; Wytham also overlaps another record.",
        "preparation": {
          "status": "tbd",
          "label": "Task pipeline TBD",
          "detail": "No self-contained whole-source pipeline has been audited for this plot-instance task.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 14984947900
    },
    {
      "name": "LAUTx",
      "short": "LAUTx",
      "modalities": [
        "Mobile"
      ],
      "domain": "Austrian forest-inventory plots",
      "geography": "Six Austrian plots",
      "scanner": "Personal laser scanning (PLS)",
      "spectral": false,
      "kind": "Plots + paired tree exports",
      "labels": "StemID; manual and automatic trees; plot treeIDv1 and updated treeIDv2",
      "role": "Versioned annotation candidate",
      "readiness": "Mapping gap",
      "tasks": [
        "instances",
        "geometry"
      ],
      "conditional": [
        "instances"
      ],
      "note": "515 manual/automatic tree pairs are annotation variants, not duplicate ground truth. Six full plots retain two label versions.",
      "correction": "All 1,036 files currently lack mapped canonical instance IDs despite preserving the source fields.",
      "provenance": "The local README documents updated labels and shared lineage with TreeLearn. Keep v1, v2 and predictions separate.",
      "review": {
        "reviewed_at": "2026-10-17",
        "scope": "Editorial source and metadata review; no new payload, rights or task admission",
        "observation_unit": "Six PLS plots and 515 paired manual/automatic tree exports.",
        "source_facts": [
          {
            "text": "Manual and automatic segmentations originate from the same six LAUT plots. Automatic outputs are predictions, not a second independent reference.",
            "url": "https://zenodo.org/records/16910335",
            "label": "Provider lineage"
          },
          {
            "text": "Complete-plot README identifies treeIDv1 as Tockner labels and treeIDv2 as Henrich revisions; classification 2 ground, 3 unlabeled, 4 tree. Corrected tree bases differ between versions.",
            "url": "https://zenodo.org/records/16910335/files/PLS_manual_segmentation_complete_point_clouds.zip",
            "label": "Archive Readme.md"
          }
        ],
        "local_observations": [
          "1,036 normalized files preserve native attributes, but the existing coarse instance view does not read StemID or treeIDv1/v2. It must not be used as complete reference."
        ],
        "open_questions": [
          "Select and pin annotation version, background/unknown handling and complete-plot coverage.",
          "Reconcile capture and annotation ancestry with TreeLearn training data."
        ],
        "published_protocol": "No executable, versioned plot-reference adapter is admitted here; preserve manual references and predictions separately.",
        "observations_snapshot": {
          "source_metadata_sha256": "af6e09df89313979a144908c5f19d72144c82a47710975b52bfd77a583c4a5d6",
          "cloud_count": 1036,
          "points": 683056645,
          "schemas": [
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "gps_time",
                "StemID"
              ],
              "files": 515
            },
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "gps_time",
                "StemID",
                "randomCol",
                "runJay"
              ],
              "files": 515
            },
            {
              "fields": [
                "X",
                "Y",
                "Z",
                "intensity",
                "return_number",
                "number_of_returns",
                "scan_direction_flag",
                "edge_of_flight_line",
                "classification",
                "synthetic",
                "key_point",
                "withheld",
                "scan_angle_rank",
                "user_data",
                "point_source_id",
                "gps_time",
                "treeIDv2",
                "treeIDv1"
              ],
              "files": 6
            }
          ]
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "partial",
          "reason": "Native instance reference is described; plot coverage, boundary rules and adapter still require task review."
        },
        "components": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "species": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "geometry": {
          "status": "documented",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        }
      },
      "study_context": "No fixed local fitting/evaluation reservation is asserted by this catalog. Task and model exposure review still apply.",
      "id": "16910335",
      "title": "LAUTx - Individual Tree Point Clouds From Austrian Forest Inventory Plots",
      "url": "https://zenodo.org/records/16910335",
      "doi": "10.5281/zenodo.16910335",
      "version": "v2",
      "license": "cc-by-4.0",
      "cloud_count": 1036,
      "points": 683056645,
      "chunks": 1947,
      "assets": 5,
      "source_fields": [
        "StemID",
        "X",
        "Y",
        "Z",
        "classification",
        "edge_of_flight_line",
        "gps_time",
        "intensity",
        "key_point",
        "number_of_returns",
        "point_source_id",
        "randomCol",
        "return_number",
        "runJay",
        "scan_angle_rank",
        "scan_direction_flag",
        "synthetic",
        "treeIDv1",
        "treeIDv2",
        "user_data",
        "withheld"
      ],
      "schemas": [
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "gps_time",
            "StemID"
          ],
          "files": 515
        },
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "gps_time",
            "StemID",
            "randomCol",
            "runJay"
          ],
          "files": 515
        },
        {
          "fields": [
            "X",
            "Y",
            "Z",
            "intensity",
            "return_number",
            "number_of_returns",
            "scan_direction_flag",
            "edge_of_flight_line",
            "classification",
            "synthetic",
            "key_point",
            "withheld",
            "scan_angle_rank",
            "user_data",
            "point_source_id",
            "gps_time",
            "treeIDv2",
            "treeIDv1"
          ],
          "files": 6
        }
      ],
      "example_paths": [
        "sources/16910335/originals/PLS_manual_segmentation/PLS_manual_segmentation/p10_0016.laz",
        "sources/16910335/originals/PLS_manual_segmentation/PLS_manual_segmentation/p10_0017.laz",
        "sources/16910335/originals/PLS_manual_segmentation/PLS_manual_segmentation/p10_0022.laz"
      ],
      "source_metadata_sha256": "af6e09df89313979a144908c5f19d72144c82a47710975b52bfd77a583c4a5d6",
      "coordinate_references": [
        {
          "value": "Unknown / not recorded",
          "files": 1036
        }
      ],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 0,
      "discovery": {
        "unit": "mixed",
        "unit_label": "Plots + paired tree exports",
        "instance_reference": {
          "status": "plots",
          "label": "Versioned plot labels reported"
        },
        "coverage": "Six plots carry treeIDv1/v2; paired manual and automatic tree exports have different roles.",
        "limitation": "The current coarse converter does not read the native instance fields.",
        "preparation": {
          "status": "tbd",
          "label": "Task pipeline TBD",
          "detail": "No self-contained whole-source pipeline has been audited for this plot-instance task.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 7818016570
    },
    {
      "name": "Wytham Woods",
      "short": "Wytham Woods",
      "modalities": [
        "Terrestrial"
      ],
      "domain": "Leaf-off temperate forest",
      "geography": "Wytham Woods, UK · Nov 2015–Jan 2016",
      "scanner": "RIEGL VZ-400 · 1550 nm",
      "spectral": false,
      "kind": "Individual trees + QSMs",
      "labels": "876 isolated-tree clouds; tree identity in filenames; derived QSMs",
      "role": "Tree structure and QSM collection",
      "readiness": "Shared-capture review",
      "tasks": [
        "geometry",
        "biomass"
      ],
      "conditional": [
        "biomass"
      ],
      "note": "A single-tree export supports tree-level studies, not full-scene detection scoring. QSM variants are derived reconstructions.",
      "correction": "PLY and TXT are alternative encodings. 280 harmonized trees exactly match the TLS benchmark; all 876 names and point counts match.",
      "provenance": "The collection contains 876 tree identities; 835 were included in the source analysis after boundary conditions.",
      "review": {
        "reviewed_at": "2026-10-17",
        "scope": "Editorial source and metadata review; no new payload, rights or task admission",
        "observation_unit": "876 isolated-tree identities and QSM reconstructions; not a complete plot reference.",
        "source_facts": [
          {
            "text": "Leaf-off scans were collected in 2015–2016 with a RIEGL VZ-400. The release contains 876 trees; the paper analysis uses 835 after applying plot-boundary conditions.",
            "url": "https://zenodo.org/records/7307956",
            "label": "Provider acquisition and analysis scope"
          },
          {
            "text": "PLY/TXT are tree exports and MAT files are TreeQSM reconstructions. Numeric-letter IDs can identify stems sharing a base. Raw scene scans are linked separately.",
            "url": "https://zenodo.org/records/7307956",
            "label": "Provider file and identity definitions"
          }
        ],
        "local_observations": [
          "876 XYZ-only PLY exports were normalized. 280 complete recorded chunk sequences match the TLS benchmark; all 876 names/point counts match, which alone does not prove every geometry identical."
        ],
        "open_questions": [
          "Link census traits, stem/base identities and QSM versions for the intended structural task.",
          "QSM-derived quantities are not automatically independent ground truth for biomass estimation."
        ],
        "published_protocol": "Apply the published boundary inclusion rule for its 835-tree analysis; isolated trees cannot measure full-scene omissions and commissions.",
        "observations_snapshot": {
          "source_metadata_sha256": "fef0d85bbd0fdf654729919cb113941becc109882896a87958657997960e2f24",
          "cloud_count": 876,
          "points": 159220306,
          "schemas": [
            {
              "fields": [
                "x",
                "y",
                "z"
              ],
              "files": 876
            }
          ]
        },
        "observations_current": true
      },
      "source_task_support": {
        "instances": {
          "status": "unsupported",
          "reason": "Isolated-tree exports do not reconstruct background or complete plot reference required for scene-level scoring."
        },
        "components": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "species": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "geometry": {
          "status": "documented",
          "reason": "XYZ can support geometry/consistency diagnostics; it cannot establish segmentation accuracy without reference."
        },
        "spectral": {
          "status": "not_documented",
          "reason": "No suitable reference for this task is established in this review; this is not proof that none exists."
        },
        "biomass": {
          "status": "derived_only",
          "reason": "Structural references or derived models require variable-level provenance; independent biomass truth is not established."
        }
      },
      "study_context": "No fixed local fitting/evaluation reservation is asserted by this catalog. Task and model exposure review still apply.",
      "id": "7307956",
      "title": "Terrestrial laser scanning data Wytham Woods: individual trees and quantitative structure models (QSMs)",
      "url": "https://zenodo.org/records/7307956",
      "doi": "10.5281/zenodo.7307956",
      "version": "Version 1.0",
      "license": "cc-by-4.0",
      "cloud_count": 876,
      "points": 159220306,
      "chunks": 991,
      "assets": 4,
      "source_fields": [
        "x",
        "y",
        "z"
      ],
      "schemas": [
        {
          "fields": [
            "x",
            "y",
            "z"
          ],
          "files": 876
        }
      ],
      "example_paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_180b.ply",
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8075b.ply",
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1623.ply"
      ],
      "source_metadata_sha256": "fef0d85bbd0fdf654729919cb113941becc109882896a87958657997960e2f24",
      "coordinate_references": [
        {
          "value": "Unknown / not recorded",
          "files": 876
        }
      ],
      "coordinate_policy": "Original numeric XYZ preserved. Missing CRS is not inferred; unit and height-datum compatibility require source-level review.",
      "deferred_clouds": 0,
      "discovery": {
        "unit": "trees",
        "unit_label": "Isolated trees + QSMs",
        "instance_reference": {
          "status": "trees",
          "label": "Isolated-tree identities only"
        },
        "coverage": "Individual-tree exports and derived reconstructions do not include complete scene background.",
        "limitation": "Cannot reconstruct plot-level omissions, commissions or complete reference.",
        "preparation": {
          "status": "tbd",
          "label": "Task pipeline TBD",
          "detail": "No self-contained whole-source pipeline has been audited for this plot-instance task.",
          "limited_reference_copy": false
        }
      },
      "download_bytes": 42804917584
    },
    {
      "id": "13255198",
      "source_ref": "zenodo:13255198",
      "title": "FOR-species20K",
      "url": "https://zenodo.org/records/13255198",
      "doi": null,
      "version": "v1",
      "license": "gpl-3.0-or-later",
      "cloud_count": 0,
      "points": 0,
      "chunks": 0,
      "assets": 3,
      "source_fields": [],
      "schemas": [],
      "example_paths": [],
      "source_metadata_sha256": "5704e9e1860789de80a2a18eabcd44444a65f56412b40f97a982cba2977357e8",
      "download_bytes": 27200371363,
      "coordinate_references": [],
      "coordinate_policy": "Native sensor views; shared coordinates and geographic independence not established",
      "deferred_clouds": 0,
      "name": "FOR-species20K",
      "short": "FOR-species20K",
      "modalities": [
        "Terrestrial",
        "Mobile",
        "Airborne",
        "Unknown"
      ],
      "domain": "Tree taxonomic classification",
      "geography": "Source-specific collections; geographic independence not demonstrated",
      "scanner": "Native TLS, MLS, ULS, unknown observations",
      "spectral": false,
      "kind": "Isolated tree observations",
      "labels": "Genus/species reference with explicit rank validity",
      "role": "Classification source",
      "readiness": "Audited native observations and validated browser preparation",
      "note": "Source conditions and native metadata stay separate. Only XYZ is a default model input.",
      "correction": "Published partitions are preserved; no labels are inferred from duplicate cloud bytes.",
      "provenance": "https://zenodo.org/records/13255198",
      "review": {
        "reviewed_at": "2026-10-22",
        "scope": "Imported upstream native audit; integration and human admission reviewed separately.",
        "observation_unit": "One physical tree with separate native sensor observations",
        "source_facts": [
          {
            "text": "Complete native audit covers 19962 tree identities and 19962 sensor observations.",
            "label": "Pinned provider release",
            "url": "https://zenodo.org/records/13255198"
          }
        ],
        "local_observations": [
          "32 normalized plots retain classification in original_points; the coarse semantic view has no mapping for it. Some plots lack treeSP."
        ],
        "open_questions": [
          "Geographic independence is not established.",
          "Views retain native coordinate frames; no cross-source calibration is inferred."
        ],
        "published_protocol": "Official partitions retained; duplicate clouds and overlapping plots are audited, not repaired.",
        "observations_snapshot": {
          "source_metadata_sha256": "5286eb84454c8a6410fe1c15ea03568a0306e5da2aff94598f8bf808e478eeb2",
          "cloud_count": 0,
          "points": 0,
          "schemas": []
        },
        "observations_current": false
      },
      "study_context": "Tree identities and sensor observations have separate scopes.",
      "discovery": {
        "unit": "trees",
        "unit_label": "Isolated-tree observations",
        "instance_reference": {
          "status": "trees",
          "label": "Taxonomic reference per tree"
        },
        "coverage": "19,962 tree identities · 19,962 native sensor observations",
        "limitation": "Published splits share plots or duplicate clouds; independent geographic evaluation is not established.",
        "preparation": {
          "status": "ready",
          "label": "Validated classification preparation",
          "detail": "Lossless native observations, explicit reference validity, preserved partitions and independent exported-dataset validation.",
          "limited_reference_copy": false
        }
      },
      "classification": {
        "source_ref": "zenodo:13255198",
        "trees": 19962,
        "observations": 19962,
        "genus_only": 0,
        "partitions": {
          "dev": 17707,
          "test": 2255
        },
        "duplicate_cloud_groups_crossing_partitions": 4,
        "metadata_path": "data/classification/source-lock.json"
      },
      "tasks": [
        "species"
      ],
      "conditional": [
        "species"
      ],
      "source_task_support": {
        "instances": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        },
        "components": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        },
        "species": {
          "status": "partial",
          "reason": "Documented rank-specific labels and audited native observations; admission pending."
        },
        "geometry": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        },
        "spectral": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        }
      }
    },
    {
      "id": "grodata-128035-1.0",
      "source_ref": "grodata:128035:1.0",
      "title": "BioDiv-3DTrees",
      "url": "https://doi.org/10.25625/8PB1IF",
      "doi": null,
      "version": "1.0",
      "license": "CC BY 4.0",
      "cloud_count": 0,
      "points": 0,
      "chunks": 0,
      "assets": 6,
      "source_fields": [],
      "schemas": [],
      "example_paths": [],
      "source_metadata_sha256": "5da1c219b30bf4e2cc092547ee0b2e9526b11d7f6d08fa141a48023b0e150a9b",
      "download_bytes": 130395095357,
      "coordinate_references": [],
      "coordinate_policy": "Native sensor views; shared coordinates and geographic independence not established",
      "deferred_clouds": 0,
      "name": "BioDiv-3DTrees",
      "short": "BioDiv-3DTrees",
      "modalities": [
        "Terrestrial",
        "Airborne"
      ],
      "domain": "Tree taxonomic classification",
      "geography": "Source-specific collections; geographic independence not demonstrated",
      "scanner": "Native TLS, ULS observations",
      "spectral": false,
      "kind": "Isolated tree observations",
      "labels": "Genus/species reference with explicit rank validity",
      "role": "Classification source",
      "readiness": "Audited native observations and validated browser preparation",
      "note": "Source conditions and native metadata stay separate. Only XYZ is a default model input.",
      "correction": "Published partitions are preserved; no labels are inferred from duplicate cloud bytes.",
      "provenance": "https://doi.org/10.25625/8PB1IF",
      "review": {
        "reviewed_at": "2026-10-22",
        "scope": "Imported upstream native audit; integration and human admission reviewed separately.",
        "observation_unit": "One physical tree with separate native sensor observations",
        "source_facts": [
          {
            "text": "Complete native audit covers 4952 tree identities and 9904 sensor observations.",
            "label": "Pinned provider release",
            "url": "https://doi.org/10.25625/8PB1IF"
          }
        ],
        "local_observations": [
          "32 normalized plots retain classification in original_points; the coarse semantic view has no mapping for it. Some plots lack treeSP."
        ],
        "open_questions": [
          "Geographic independence is not established.",
          "Views retain native coordinate frames; no cross-source calibration is inferred."
        ],
        "published_protocol": "Official partitions retained; duplicate clouds and overlapping plots are audited, not repaired.",
        "observations_snapshot": {
          "source_metadata_sha256": "5da1c219b30bf4e2cc092547ee0b2e9526b11d7f6d08fa141a48023b0e150a9b",
          "cloud_count": 0,
          "points": 0,
          "schemas": []
        },
        "observations_current": true
      },
      "study_context": "Tree identities and sensor observations have separate scopes.",
      "discovery": {
        "unit": "trees",
        "unit_label": "Isolated-tree observations",
        "instance_reference": {
          "status": "trees",
          "label": "Taxonomic reference per tree"
        },
        "coverage": "4,952 tree identities · 9,904 native sensor observations",
        "limitation": "Published splits share plots or duplicate clouds; independent geographic evaluation is not established.",
        "preparation": {
          "status": "ready",
          "label": "Validated classification preparation",
          "detail": "Lossless native observations, explicit reference validity, preserved partitions and independent exported-dataset validation.",
          "limited_reference_copy": false
        }
      },
      "classification": {
        "source_ref": "grodata:128035:1.0",
        "trees": 4952,
        "observations": 9904,
        "genus_only": 213,
        "partitions": {
          "train": 3957,
          "test": 495,
          "validate": 495,
          "unassigned": 5
        },
        "duplicate_cloud_groups_crossing_partitions": 0,
        "metadata_path": "data/classification/source-lock.json"
      },
      "tasks": [
        "species"
      ],
      "conditional": [
        "species"
      ],
      "source_task_support": {
        "instances": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        },
        "components": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        },
        "species": {
          "status": "partial",
          "reason": "Documented rank-specific labels and audited native observations; admission pending."
        },
        "geometry": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        },
        "spectral": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        },
        "biomass": {
          "status": "not_documented",
          "reason": "Not reviewed for this task."
        }
      }
    }
  ],
  "mappings": [
    {
      "id": "v1-v2-lineage",
      "source": "8287792",
      "target": "16742708",
      "kind": "unknown",
      "tasks": [
        "geometry",
        "components"
      ],
      "name": "Shared collection lineage",
      "rule": "Reconcile collection, plot and annotation descendants before splitting.",
      "loss": "No full point-set overlap audit has been completed. Dataset-out is not certified site-out.",
      "evidence_status": "No audited transfer function registered",
      "implementation": "Not executable; no complete transformation package is registered for this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/8287792"
        }
      ],
      "contract": {
        "status": "review_required",
        "input": "Collection, plot, capture and annotation identities",
        "output": "Candidate dependency groups",
        "steps": [
          "join releases on reviewed capture identity; do not join on record ID alone",
          "assign every annotation descendant to its capture group before splitting"
        ],
        "preconditions": [
          "Full point-set overlap and capture reconciliation remain incomplete."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      }
    },
    {
      "id": "tls-v2",
      "source": "16875688",
      "target": "16742708",
      "kind": "transform",
      "tasks": [
        "instances"
      ],
      "name": "Instance-schema crosswalk · label helper",
      "rule": "Map positive instance values; ground is semantic=0 in the source. Keep plot and boundary-tree groups together.",
      "loss": "Source tree semantics cannot be converted to wood/foliage ground truth.",
      "evidence_status": "Label helper tested; complete task pipeline not validated",
      "implementation": "See exact task-label helper in scripts/task_contracts.py; it is not a whole-dataset pipeline.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/16875688"
        }
      ],
      "contract": {
        "status": "tested_label_helper",
        "input": "Annotated plot PLY instance + semantic (0 ground, 1 tree)",
        "output": "Task instance IDs: -1 unknown, 0 background, positive trees",
        "steps": [
          "out.instance[:] = -1",
          "out.instance[instance > 0] = instance[instance > 0]",
          "out.instance[semantic == 0] = 0",
          "out.valid = out.instance >= 0"
        ],
        "preconditions": [
          "Require both fields and validated integral values.",
          "Exclude XYZ-only exports from plot reference; audit complete plot/area coverage."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      }
    },
    {
      "kind": "transform",
      "name": "Tree IDs + coverage policy",
      "rule": "Map positive treeID and retain completelyInside, species and source PointID attributes. Specify incomplete-tree scoring.",
      "loss": "The view adds no ground/wood/foliage annotations; locations are insufficient for strict site-out certification.",
      "evidence_status": "Existing converter inspected; task compatibility not validated",
      "implementation": "Existing source-aware projection in scripts/harmonize_lidar.py; no complete task pipeline validated by this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/19127709"
        },
        {
          "label": "Inspected converter",
          "url": "https://github.com/BorjaArroyo/forestry-lidar-catalogue/blob/4291fa7734f899db2446c9f7b4e3f84b4576fbc8/scripts/harmonize_lidar.py"
        }
      ],
      "contract": {
        "status": "legacy_code_inspection",
        "input": "LAS treeID, treeSP, completelyInside + plot ID",
        "output": "Proposed instance projection with native species/coverage metadata",
        "steps": [
          "out.instance[:] = -1; out.instance[treeID > 0] = treeID[treeID > 0]",
          "retain treeSP and completelyInside without recoding",
          "join species_id.csv on treeSP; keep treeSP == 0 unknown/non-tree"
        ],
        "preconditions": [
          "Choose how treeID==0 is scored; the legacy view currently leaves it unknown.",
          "Declare cropped-crown scoring and verify taxonomic lookup; no wood/foliage inference."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      },
      "id": "treescan-v2",
      "source": "19127709",
      "target": "16742708",
      "tasks": [
        "instances"
      ]
    },
    {
      "kind": "transform",
      "name": "Instance IDs with out-mask",
      "rule": "Existing coarse instance projection with class-5 unknown mask; no rows deleted. Retain native background/object distinctions.",
      "loss": "The local study reserves selected test plots. Provider training data remain a separate published split; broad tree labels cannot supervise wood/foliage.",
      "evidence_status": "Existing converter inspected; task compatibility not validated",
      "implementation": "Existing source-aware projection in scripts/harmonize_lidar.py; no complete task pipeline validated by this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/19351234"
        },
        {
          "label": "Inspected converter",
          "url": "https://github.com/BorjaArroyo/forestry-lidar-catalogue/blob/4291fa7734f899db2446c9f7b4e3f84b4576fbc8/scripts/harmonize_lidar.py"
        }
      ],
      "contract": {
        "status": "legacy_code_inspection",
        "input": "LAS tree_index + classification",
        "output": "Legacy coarse instance view; native classes retained",
        "steps": [
          "out.instance[:] = -1; out.instance[tree_index > 0] = tree_index[tree_index > 0]",
          "out.instance[classification in {2,3,4}] = 0",
          "out.instance[classification == 5] = -1",
          "out.valid = out.instance >= 0; retain all source rows"
        ],
        "preconditions": [
          "This describes the existing converter, not a validated FGI evaluator adapter.",
          "Choose learned versus unsupervised filtering; class 0 is not automatically terrain."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      },
      "id": "fgi-v2",
      "source": "19351234",
      "target": "16742708",
      "tasks": [
        "instances"
      ]
    },
    {
      "kind": "partial",
      "name": "Two labeled plots only",
      "rule": "Existing coarse projection on labeled plots only; native understory retained. The local study reservation and provider cylinder split differ.",
      "loss": "Understory remains unknown in the coarse view. The 18 unlabeled plots cannot provide reference accuracy; the provider did use unlabeled data for training.",
      "evidence_status": "Existing converter inspected; task compatibility not validated",
      "implementation": "Existing source-aware projection in scripts/harmonize_lidar.py; no complete task pipeline validated by this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/15913427"
        },
        {
          "label": "Inspected converter",
          "url": "https://github.com/BorjaArroyo/forestry-lidar-catalogue/blob/4291fa7734f899db2446c9f7b4e3f84b4576fbc8/scripts/harmonize_lidar.py"
        }
      ],
      "contract": {
        "status": "legacy_code_inspection",
        "input": "Labeled plots 1/2: tree_index, classification; all plots: normalized XYZ",
        "output": "Legacy coarse instance/semantic view with source labels",
        "steps": [
          "semantic[:] = 0; instance[:] = -1",
          "if plot_id in {1,2}: instance[tree_index > 0] = tree_index[tree_index > 0]",
          "if plot_id in {1,2}: semantic[classification == 0] = 3; semantic[classification == 1] = 2",
          "leave understory unknown in coarse semantic view; retain native classification == 2",
          "copy XYZ; do not subtract another terrain model"
        ],
        "preconditions": [
          "Identify labeled files from pinned source identity, not presence of the standard LAS classification field.",
          "Keep published cylinder protocol separate from the local terminal-evaluation reservation."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      },
      "id": "evo-v2",
      "source": "15913427",
      "target": "16742708",
      "tasks": [
        "instances",
        "components"
      ]
    },
    {
      "kind": "partial",
      "name": "Collapse component granularity",
      "rule": "Ground 0→ground; trunk 2 and branches 3→wood; foliage 4→foliage. Retain low vegetation and woody debris separately.",
      "loss": "Collapsing subclasses loses detail. Whether fallen woody debris belongs to a target wood task requires an explicit task definition.",
      "evidence_status": "Existing converter inspected; task compatibility not validated",
      "implementation": "Existing source-aware projection in scripts/harmonize_lidar.py; no complete task pipeline validated by this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/17172162"
        },
        {
          "label": "Inspected converter",
          "url": "https://github.com/BorjaArroyo/forestry-lidar-catalogue/blob/4291fa7734f899db2446c9f7b4e3f84b4576fbc8/scripts/harmonize_lidar.py"
        }
      ],
      "contract": {
        "status": "legacy_code_inspection",
        "input": "LAS semantic_GT: native classes 0–5",
        "output": "Legacy coarse semantic view, plus unchanged native labels",
        "steps": [
          "semantic[:] = 0",
          "semantic[semantic_GT == 0] = 1",
          "semantic[semantic_GT in {2,3}] = 2",
          "semantic[semantic_GT == 4] = 3",
          "semantic_valid = semantic > 0; instance[:] = -1",
          "retain low vegetation (1) and woody debris (5) in original_points"
        ],
        "preconditions": [
          "The coarse projection loses trunk/branch separation and does not supervise classes 1/5.",
          "This projection alone is not a task-validated pipeline."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      },
      "id": "ms-v2",
      "source": "17172162",
      "target": "16742708",
      "tasks": [
        "components"
      ]
    },
    {
      "id": "ms-no-instance",
      "source": "17172162",
      "target": "16742708",
      "kind": "blocked",
      "tasks": [
        "instances"
      ],
      "name": "No instance reference",
      "rule": "No tree-instance labels are documented. A semantic crosswalk cannot manufacture independent instance ground truth.",
      "loss": "Pseudo-labeling would be a separate model-generated training arm, not reference evaluation.",
      "evidence_status": "No admitted transformation",
      "implementation": "Not executable; no complete transformation package is registered for this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/17172162"
        }
      ],
      "contract": {
        "status": "blocked",
        "input": "semantic_GT only",
        "output": "No instance reference",
        "steps": [
          "STOP: no documented native tree-instance labels"
        ],
        "preconditions": [
          "Model pseudo-labels must be marked as predictions and cannot replace independent reference."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      }
    },
    {
      "id": "forestsemantic-v2",
      "source": "15193973",
      "target": "16742708",
      "kind": "blocked",
      "tasks": [
        "instances",
        "components"
      ],
      "name": "Derivative-rights review",
      "rule": "Keep source annotations intact; settle intended use and component terms before producing aligned derivatives.",
      "loss": "Three conversions remain intentionally deferred. Metadata availability does not grant derivative permission.",
      "evidence_status": "No admitted transformation",
      "implementation": "Not executable; no complete transformation package is registered for this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/15193973"
        }
      ],
      "contract": {
        "status": "blocked",
        "input": "Native LAS and reference tables; derivative-rights gate closed",
        "output": "No derivative admitted",
        "steps": [
          "STOP before conversion while existing rights-review gate remains closed"
        ],
        "preconditions": [
          "Retain native tree IDs in point_source_id, branch IDs in gps_time and six component classes.",
          "Settle intended-use terms and validate task mapping before enabling a derivative."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      }
    },
    {
      "id": "lautx-v2",
      "source": "16910335",
      "target": "16742708",
      "kind": "transform",
      "tasks": [
        "instances"
      ],
      "name": "Missing versioned instance adapter",
      "rule": "No task adapter is registered. Native manual references, two plot-label versions and automatic outputs require separate roles.",
      "loss": "The current coarse export misses these instance fields. Different label versions and automatic segmentations are not interchangeable references.",
      "evidence_status": "No audited transfer function registered",
      "implementation": "Not executable; no complete transformation package is registered for this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/16910335"
        }
      ],
      "contract": {
        "status": "review_required",
        "input": "Complete-plot LAS: treeIDv1, treeIDv2, classification",
        "output": "No admitted reference adapter",
        "steps": [
          "STOP: neither StemID nor treeIDv1/v2 is read by the existing harmonizer",
          "Before any implementation, review the selected annotation version, classification semantics and coverage together"
        ],
        "preconditions": [
          "Original fields are preserved, but the coarse instance output is unknown.",
          "A proposed field choice does not constitute an audited transformation."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      }
    },
    {
      "id": "wytham-overlap",
      "source": "7307956",
      "target": "16875688",
      "kind": "shared",
      "tasks": [
        "instances",
        "geometry",
        "biomass"
      ],
      "name": "Shared Wytham tree exports",
      "rule": "280 complete harmonized chunk sequences match exactly. All 876 Wytham tree names appear in the TLS collection with matching point counts.",
      "loss": "Group shared tree/capture identities across datasets before splitting. The remaining pairs require geometry-level confirmation.",
      "evidence_status": "Recorded metadata evidence; no geometry reread",
      "implementation": "Not executable; no complete transformation package is registered for this relationship.",
      "evidence": [
        {
          "label": "Acquisition and curation audit",
          "local": "docs/lidar-acquisition-log.md"
        },
        {
          "label": "Wytham source",
          "url": "https://zenodo.org/records/7307956"
        },
        {
          "label": "TLS benchmark source",
          "url": "https://zenodo.org/records/16875688"
        }
      ],
      "contract": {
        "status": "dependency_evidence",
        "input": "Recorded complete chunk-hash sequences, filenames and point counts",
        "output": "Dependency candidates; no deletion plan",
        "steps": [
          "confirmed = pairs with matching complete recorded chunk sequences",
          "name_count_only = matching names/counts without full geometry confirmation",
          "keep evidence levels separate; group shared captures before assigning splits"
        ],
        "preconditions": [
          "280 cross-source extras have hash-sequence evidence.",
          "876 matching names/counts are not 876 independently verified geometry matches."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      }
    },
    {
      "id": "spectral-fgi",
      "source": "17172162",
      "target": "19351234",
      "kind": "unknown",
      "tasks": [
        "spectral"
      ],
      "name": "Channel calibration review",
      "rule": "Check wavelength, radiometric units, calibration and co-registration per capture before pooling spectral channels.",
      "loss": "Shared channel names or research institutions do not prove equal radiometry or independent sites.",
      "evidence_status": "No audited transfer function registered",
      "implementation": "Not executable; no complete transformation package is registered for this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/17172162"
        }
      ],
      "contract": {
        "status": "review_required",
        "input": "Native wavelengths, radiometric units, calibration and registration",
        "output": "No registered radiometric transfer",
        "steps": [
          "STOP: no calibrated transfer parameters or validated transformation are registered"
        ],
        "preconditions": [
          "Matching channel names/wavelengths do not establish equivalent reflectance.",
          "Review acquisition calibration and capture independence first."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      }
    },
    {
      "id": "spectral-evo",
      "source": "15913427",
      "target": "19351234",
      "kind": "unknown",
      "tasks": [
        "spectral"
      ],
      "name": "Spectral alignment candidate",
      "rule": "Retain channel definitions and verify normalization and acquisition geometry. Preserve external evaluation reservations.",
      "loss": "No validated radiometric transfer function is currently registered.",
      "evidence_status": "No audited transfer function registered",
      "implementation": "Not executable; no complete transformation package is registered for this relationship.",
      "evidence": [
        {
          "label": "Source record",
          "url": "https://zenodo.org/records/15913427"
        }
      ],
      "contract": {
        "status": "review_required",
        "input": "Native wavelengths, radiometric units, calibration and registration",
        "output": "No registered radiometric transfer",
        "steps": [
          "STOP: no calibrated transfer parameters or validated transformation are registered"
        ],
        "preconditions": [
          "Matching channel names/wavelengths do not establish equivalent reflectance.",
          "Review acquisition calibration and capture independence first."
        ],
        "preserved": "Native fields and source identities remain available; target IDs do not define a universal ontology.",
        "target_scope": "Historical schema relationship only; does not transform a source into the full target dataset or establish model transferability."
      }
    }
  ],
  "findings": [
    {
      "id": "duplicates",
      "severity": "high",
      "title": "398 duplicate normalized exports",
      "count": 398,
      "description": "Complete recorded chunk-hash sequences identify these extra exports. These are saved hash records, not a current payload reread or a deletion decision.",
      "datasets": [
        "16875688",
        "7307956"
      ],
      "state": "Confirmed metadata evidence"
    },
    {
      "id": "split-leakage",
      "severity": "high",
      "title": "118 exact copies span train / validation",
      "count": 118,
      "description": "The source manifests identify byte-identical TLS tree exports in both folders. Official plot splits and extracted-tree evaluation have different units.",
      "datasets": [
        "16875688"
      ],
      "state": "Source-hash evidence"
    },
    {
      "id": "lautx",
      "severity": "high",
      "title": "1,036 files need an instance crosswalk",
      "count": 1036,
      "description": "StemID and treeIDv1/v2 survive in original_points but are not read by the existing harmonizer. Manual/automatic pairs must remain separate annotation variants.",
      "datasets": [
        "16910335"
      ],
      "state": "Schema audit + sampled payloads"
    },
    {
      "id": "semantics",
      "severity": "medium",
      "title": "Available source labels are not all mapped",
      "count": 38,
      "description": "FOR v1 classification is unmapped; ForestSemantic-MS preserves low vegetation and woody debris without a coarse semantic assignment. This requires task-specific mapping decisions.",
      "datasets": [
        "8287792",
        "17172162"
      ],
      "state": "Schema audit + source definitions"
    },
    {
      "id": "lineage",
      "severity": "high",
      "title": "No certified site-out split yet",
      "count": 5626,
      "description": "Records counted here lack reviewed site or split metadata. Cross-dataset identities and annotation descendants must be grouped before evaluation.",
      "datasets": [
        "8287792",
        "16742708",
        "15193973",
        "17172162",
        "19351234",
        "15913427",
        "19127709",
        "16875688",
        "16910335",
        "7307956"
      ],
      "state": "Full metadata audit"
    },
    {
      "id": "rights",
      "severity": "medium",
      "title": "Three derivatives deliberately deferred",
      "count": 3,
      "description": "ForestSemantic source files are acquired; their conversions await derivative-rights review. Other record-declared licenses still require component and intended-use checks.",
      "datasets": [
        "15193973"
      ],
      "state": "Acquisition policy"
    },
    {
      "id": "balance",
      "severity": "medium",
      "title": "Point count is strongly imbalanced",
      "count": 85,
      "description": "TreeScanPL10K accounts for approximately 85% of stored normalized points before deduplication. File counts do not measure independent sites or balanced training exposure.",
      "datasets": [
        "19127709"
      ],
      "state": "Full metadata audit"
    }
  ],
  "duplicates": [
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2053c.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2053c.ply"
      ],
      "points": 46277
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1384.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1384.ply"
      ],
      "points": 67158
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8388.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8388.ply"
      ],
      "points": 162802
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8377.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8377.ply"
      ],
      "points": 33137
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_354b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_354b.ply"
      ],
      "points": 419026
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1596.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1596.ply"
      ],
      "points": 39963
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_122a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_122a.ply"
      ],
      "points": 187549
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_712b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_712b.ply"
      ],
      "points": 251142
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_899a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_899a.ply"
      ],
      "points": 32269
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_196.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_196.ply"
      ],
      "points": 229547
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_175a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_175a.ply"
      ],
      "points": 38650
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8404.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8404.ply"
      ],
      "points": 8671
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8410.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8410.ply"
      ],
      "points": 6675
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_9083.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_9083.ply"
      ],
      "points": 42602
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8389.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8389.ply"
      ],
      "points": 161200
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2053b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2053b.ply"
      ],
      "points": 1255
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_746.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_746.ply"
      ],
      "points": 476838
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1393.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1393.ply"
      ],
      "points": 113476
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8374.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8374.ply"
      ],
      "points": 27476
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2117.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2117.ply"
      ],
      "points": 46519
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8348.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8348.ply"
      ],
      "points": 4046
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_354a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_354a.ply"
      ],
      "points": 93645
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_122b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_122b.ply"
      ],
      "points": 97839
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_899b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_899b.ply"
      ],
      "points": 52182
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_175b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_175b.ply"
      ],
      "points": 22256
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_175c.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_175c.ply"
      ],
      "points": 381595
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1755.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1755.ply"
      ],
      "points": 55839
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_899c.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_899c.ply"
      ],
      "points": 27816
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_122c.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_122c.ply"
      ],
      "points": 39130
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1225.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1225.ply"
      ],
      "points": 166861
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8407.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8407.ply"
      ],
      "points": 40699
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1423.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1423.ply"
      ],
      "points": 253538
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8361.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8361.ply"
      ],
      "points": 122404
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_209.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_209.ply"
      ],
      "points": 424749
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2053a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2053a.ply"
      ],
      "points": 14033
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_786.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_786.ply"
      ],
      "points": 153658
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1625.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1625.ply"
      ],
      "points": 94672
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_9084.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_9084.ply"
      ],
      "points": 101506
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_9090.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_9090.ply"
      ],
      "points": 84445
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_580.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_580.ply"
      ],
      "points": 334217
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8365.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8365.ply"
      ],
      "points": 20056
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8417.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8417.ply"
      ],
      "points": 9932
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8371.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8371.ply"
      ],
      "points": 72463
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1209.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1209.ply"
      ],
      "points": 117345
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_416a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_416a.ply"
      ],
      "points": 180677
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_807.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_807.ply"
      ],
      "points": 147206
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1778.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1778.ply"
      ],
      "points": 43329
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_197a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_197a.ply"
      ],
      "points": 579596
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_122f.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_122f.ply"
      ],
      "points": 134682
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2067.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2067.ply"
      ],
      "points": 30701
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8416.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8416.ply"
      ],
      "points": 7301
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_640a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_640a.ply"
      ],
      "points": 116905
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8370.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8370.ply"
      ],
      "points": 9022
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8364.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8364.ply"
      ],
      "points": 155417
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8402.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8402.ply"
      ],
      "points": 31345
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_9085.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_9085.ply"
      ],
      "points": 27802
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2053d.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2053d.ply"
      ],
      "points": 26807
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1035b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1035b.ply"
      ],
      "points": 13159
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_781.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_781.ply"
      ],
      "points": 117591
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8428.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8428.ply"
      ],
      "points": 21055
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8372.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8372.ply"
      ],
      "points": 5079
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8414.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8414.ply"
      ],
      "points": 22286
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8400.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8400.ply"
      ],
      "points": 90089
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8366.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8366.ply"
      ],
      "points": 41716
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_122d.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_122d.ply"
      ],
      "points": 127328
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1544.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1544.ply"
      ],
      "points": 89494
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1008.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1008.ply"
      ],
      "points": 137452
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_197b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_197b.ply"
      ],
      "points": 41045
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_122e.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_122e.ply"
      ],
      "points": 132393
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_421.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_421.ply"
      ],
      "points": 658187
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8401.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8401.ply"
      ],
      "points": 12318
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8367.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8367.ply"
      ],
      "points": 25408
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8373.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8373.ply"
      ],
      "points": 81706
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_640b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_640b.ply"
      ],
      "points": 29364
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8429.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8429.ply"
      ],
      "points": 19239
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_9086.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_9086.ply"
      ],
      "points": 10185
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_541.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_541.ply"
      ],
      "points": 276383
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_555.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_555.ply"
      ],
      "points": 147930
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_62.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_62.ply"
      ],
      "points": 645030
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_794.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_794.ply"
      ],
      "points": 112715
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1035a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1035a.ply"
      ],
      "points": 112072
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1873.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1873.ply"
      ],
      "points": 54693
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2146d.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_2146d.ply"
      ],
      "points": 29455
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8300.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8300.ply"
      ],
      "points": 49408
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_33b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_33b.ply"
      ],
      "points": 26717
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_491.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_491.ply"
      ],
      "points": 293575
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1720.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1720.ply"
      ],
      "points": 47675
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1708.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1708.ply"
      ],
      "points": 79377
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_889.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_889.ply"
      ],
      "points": 172913
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_484.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_484.ply"
      ],
      "points": 182964
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_718c.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_718c.ply"
      ],
      "points": 271888
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_145a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_145a.ply"
      ],
      "points": 420419
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8301.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8301.ply"
      ],
      "points": 24498
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8315.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8315.ply"
      ],
      "points": 68643
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_269.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_269.ply"
      ],
      "points": 353961
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_727.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_727.ply"
      ],
      "points": 118070
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_12.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_12.ply"
      ],
      "points": 1640567
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1119.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1119.ply"
      ],
      "points": 59608
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8303.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8303.ply"
      ],
      "points": 33341
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_427a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_427a.ply"
      ],
      "points": 350754
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8317.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8317.ply"
      ],
      "points": 19835
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_145c.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_145c.ply"
      ],
      "points": 3039
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_33a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_33a.ply"
      ],
      "points": 121857
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_718a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_718a.ply"
      ],
      "points": 152452
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1535.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1535.ply"
      ],
      "points": 511390
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1045.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1045.ply"
      ],
      "points": 139992
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_6.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_6.ply"
      ],
      "points": 1684982
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8316.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8316.ply"
      ],
      "points": 6179
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8302.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8302.ply"
      ],
      "points": 21326
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_901.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_901.ply"
      ],
      "points": 130468
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1789a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1789a.ply"
      ],
      "points": 10905
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2280b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2280b.ply"
      ],
      "points": 56964
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2146b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_2146b.ply"
      ],
      "points": 18227
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8306.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8306.ply"
      ],
      "points": 10632
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_332.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_332.ply"
      ],
      "points": 244944
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1242.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1242.ply"
      ],
      "points": 46339
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_871.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_871.ply"
      ],
      "points": 221704
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_119.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_119.ply"
      ],
      "points": 294054
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1928.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1928.ply"
      ],
      "points": 119903
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2146c.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_2146c.ply"
      ],
      "points": 5977
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1109.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1109.ply"
      ],
      "points": 81152
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2366.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2366.ply"
      ],
      "points": 6950
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_735.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_735.ply"
      ],
      "points": 236787
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1789b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1789b.ply"
      ],
      "points": 22208
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2280a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_2280a.ply"
      ],
      "points": 78546
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_145e.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_145e.ply"
      ],
      "points": 10447
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8339.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8339.ply"
      ],
      "points": 110184
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8305.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8305.ply"
      ],
      "points": 10374
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2146a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_2146a.ply"
      ],
      "points": 13649
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1255.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1255.ply"
      ],
      "points": 158398
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1080.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1080.ply"
      ],
      "points": 568421
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1731.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1731.ply"
      ],
      "points": 31546
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1240.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1240.ply"
      ],
      "points": 59363
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8304.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8304.ply"
      ],
      "points": 31263
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8338.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8338.ply"
      ],
      "points": 4691
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2309c.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2309c.ply"
      ],
      "points": 16484
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_281a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_281a.ply"
      ],
      "points": 233974
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8335.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8335.ply"
      ],
      "points": 45424
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8321.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8321.ply"
      ],
      "points": 22775
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8309.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8309.ply"
      ],
      "points": 69475
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1517.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1517.ply"
      ],
      "points": 45183
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1926.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1926.ply"
      ],
      "points": 68811
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_809b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_809b.ply"
      ],
      "points": 81890
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2128a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2128a.ply"
      ],
      "points": 7773
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8308.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8308.ply"
      ],
      "points": 4148
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8320.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8320.ply"
      ],
      "points": 4215
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1476.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1476.ply"
      ],
      "points": 300265
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8334.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8334.ply"
      ],
      "points": 13489
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1657a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1657a.ply"
      ],
      "points": 74822
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1745a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1745a.ply"
      ],
      "points": 101001
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2309b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2309b.ply"
      ],
      "points": 25549
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_538.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_538.ply"
      ],
      "points": 134123
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_281b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_281b.ply"
      ],
      "points": 120411
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8322.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8322.ply"
      ],
      "points": 8513
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8336.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8336.ply"
      ],
      "points": 40100
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1448.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1448.ply"
      ],
      "points": 148090
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2128c.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2128c.ply"
      ],
      "points": 51015
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1514.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1514.ply"
      ],
      "points": 60740
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1931.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1931.ply"
      ],
      "points": 49473
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_809a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_809a.ply"
      ],
      "points": 88275
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_672.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_672.ply"
      ],
      "points": 123883
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2237.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2237.ply"
      ],
      "points": 53704
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_317.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_317.ply"
      ],
      "points": 390828
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2128b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2128b.ply"
      ],
      "points": 40274
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_459.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_459.ply"
      ],
      "points": 248615
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1475.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1475.ply"
      ],
      "points": 106578
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8337.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8337.ply"
      ],
      "points": 8790
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8323.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8323.ply"
      ],
      "points": 14600
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1657b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1657b.ply"
      ],
      "points": 15910
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1111.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1111.ply"
      ],
      "points": 243272
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1745b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1745b.ply"
      ],
      "points": 30441
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1436a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1436a.ply"
      ],
      "points": 167223
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2083b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2083b.ply"
      ],
      "points": 7527
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1505.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1505.ply"
      ],
      "points": 44286
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_878.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_878.ply"
      ],
      "points": 102643
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_688.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_688.ply"
      ],
      "points": 112419
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_104.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_104.ply"
      ],
      "points": 379956
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_460.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_460.ply"
      ],
      "points": 260865
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8326.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8326.ply"
      ],
      "points": 17839
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_280b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_280b.ply"
      ],
      "points": 73395
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_234a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_234a.ply"
      ],
      "points": 546670
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2184.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2184.ply"
      ],
      "points": 13185
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1436b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1436b.ply"
      ],
      "points": 53348
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8324.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8324.ply"
      ],
      "points": 21419
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8442.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8442.ply"
      ],
      "points": 63296
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2083a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2083a.ply"
      ],
      "points": 36307
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1089.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1089.ply"
      ],
      "points": 46116
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8319.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8319.ply"
      ],
      "points": 22101
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_280a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_280a.ply"
      ],
      "points": 303611
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8381.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8381.ply"
      ],
      "points": 114793
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_264a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_264a.ply"
      ],
      "points": 46799
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8342.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8342.ply"
      ],
      "points": 42257
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8418.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8418.ply"
      ],
      "points": 4962
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_410.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_410.ply"
      ],
      "points": 520805
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_122h.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_122h.ply"
      ],
      "points": 10694
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8333b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8333b.ply"
      ],
      "points": 20775
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1986.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1986.ply"
      ],
      "points": 20392
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1950.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1950.ply"
      ],
      "points": 2706
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_122i.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_122i.ply"
      ],
      "points": 172054
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8343.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8343.ply"
      ],
      "points": 51986
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8425.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8425.ply"
      ],
      "points": 21149
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8380.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8380.ply"
      ],
      "points": 56549
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8394.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8394.ply"
      ],
      "points": 92567
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_93.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_93.ply"
      ],
      "points": 245629
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8382.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8382.ply"
      ],
      "points": 41387
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8396.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8396.ply"
      ],
      "points": 129280
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8427.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8427.ply"
      ],
      "points": 5798
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8341.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8341.ply"
      ],
      "points": 11059
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_264b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_264b.ply"
      ],
      "points": 40953
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8369.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8369.ply"
      ],
      "points": 21935
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_413.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_413.ply"
      ],
      "points": 334785
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8333a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8333a.ply"
      ],
      "points": 107890
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2283.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_2283.ply"
      ],
      "points": 29706
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_837.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_837.ply"
      ],
      "points": 269625
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_162.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_162.ply"
      ],
      "points": 347642
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1576.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1576.ply"
      ],
      "points": 141317
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2094.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_2094.ply"
      ],
      "points": 52268
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8368.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8368.ply"
      ],
      "points": 53814
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8354.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8354.ply"
      ],
      "points": 53325
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_264c.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_264c.ply"
      ],
      "points": 8504
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8426.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8426.ply"
      ],
      "points": 39218
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1364.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1364.ply"
      ],
      "points": 78440
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8340.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8340.ply"
      ],
      "points": 48465
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_774.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_774.ply"
      ],
      "points": 264609
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1610.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1610.ply"
      ],
      "points": 56052
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8406c.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8406c.ply"
      ],
      "points": 37442
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8387.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8387.ply"
      ],
      "points": 31631
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_20b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_20b.ply"
      ],
      "points": 81595
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8393.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8393.ply"
      ],
      "points": 7698
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8378.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8378.ply"
      ],
      "points": 27083
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8344.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8344.ply"
      ],
      "points": 58604
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_9112.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_9112.ply"
      ],
      "points": 111403
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1867b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1867b.ply"
      ],
      "points": 42321
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_833.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_833.ply"
      ],
      "points": 285764
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1390a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1390a.ply"
      ],
      "points": 50297
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2293.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2293.ply"
      ],
      "points": 53009
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_264f.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_264f.ply"
      ],
      "points": 235058
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8437.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8437.ply"
      ],
      "points": 4771
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8351.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8351.ply"
      ],
      "points": 8981
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1407.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1407.ply"
      ],
      "points": 95769
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8345.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8345.ply"
      ],
      "points": 15888
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8423.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8423.ply"
      ],
      "points": 23635
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8379.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8379.ply"
      ],
      "points": 61901
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8386.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8386.ply"
      ],
      "points": 22744
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_9098.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_9098.ply"
      ],
      "points": 88201
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8406b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8406b.ply"
      ],
      "points": 55828
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_577.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_577.ply"
      ],
      "points": 144902
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_985.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_985.ply"
      ],
      "points": 84891
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_818b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_818b.ply"
      ],
      "points": 47497
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_20a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_20a.ply"
      ],
      "points": 477688
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8384.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8384.ply"
      ],
      "points": 313752
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8409.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8409.ply"
      ],
      "points": 19635
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8353.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8353.ply"
      ],
      "points": 13331
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_264d.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_264d.ply"
      ],
      "points": 18641
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8347.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8347.ply"
      ],
      "points": 20230
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_9111.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_9111.ply"
      ],
      "points": 188787
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1867a.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1867a.ply"
      ],
      "points": 216049
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1968.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1968.ply"
      ],
      "points": 45733
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1766.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1766.ply"
      ],
      "points": 33223
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1390b.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1390b.ply"
      ],
      "points": 31602
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_158.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_158.ply"
      ],
      "points": 429289
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2284.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2284.ply"
      ],
      "points": 73919
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_616.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_616.ply"
      ],
      "points": 166563
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1558.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_1558.ply"
      ],
      "points": 48041
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2086.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2086.ply"
      ],
      "points": 23352
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8420.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8420.ply"
      ],
      "points": 16737
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8352.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8352.ply"
      ],
      "points": 43359
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_264e.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_264e.ply"
      ],
      "points": 41456
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8408.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8408.ply"
      ],
      "points": 10892
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8385.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8385.ply"
      ],
      "points": 86334
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8391.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8391.ply"
      ],
      "points": 22352
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8406a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8406a.ply"
      ],
      "points": 55122
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_818a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_818a.ply"
      ],
      "points": 265480
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_20_-100_Boom13.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_20_-100_Boom13.ply"
      ],
      "points": 77319
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_20_-100_Boom31.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_20_-100_Boom31.ply"
      ],
      "points": 58334
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_20_-100_Boom9.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_20_-100_Boom9.ply"
      ],
      "points": 774468
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_20_-60_Boom20.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_20_-60_Boom20.ply"
      ],
      "points": 108788
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-100_Boom12.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-100_Boom12.ply"
      ],
      "points": 56946
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-100_Boom29.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-100_Boom29.ply"
      ],
      "points": 40784
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-100_Boom31.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-100_Boom31.ply"
      ],
      "points": 23725
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-60_Boom11.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-60_Boom11.ply"
      ],
      "points": 50539
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-60_Boom12.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-60_Boom12.ply"
      ],
      "points": 59994
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-60_Boom22.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-60_Boom22.ply"
      ],
      "points": 17976
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-60_Boom3.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-60_Boom3.ply"
      ],
      "points": 661124
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-80_Boom12.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-80_Boom12.ply"
      ],
      "points": 663942
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_001.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_001.ply"
      ],
      "points": 188112
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_003.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_003.ply"
      ],
      "points": 574970
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_004.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_004.ply"
      ],
      "points": 73531
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_006.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_006.ply"
      ],
      "points": 516511
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_011.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_011.ply"
      ],
      "points": 876685
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_017.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_017.ply"
      ],
      "points": 161682
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_021.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_021.ply"
      ],
      "points": 260317
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_043.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_043.ply"
      ],
      "points": 163813
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_048.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_048.ply"
      ],
      "points": 128181
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_052.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_052.ply"
      ],
      "points": 303216
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_057.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_057.ply"
      ],
      "points": 129101
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_059.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_059.ply"
      ],
      "points": 75830
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_063.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_063.ply"
      ],
      "points": 156681
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_073.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_073.ply"
      ],
      "points": 115141
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_074.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_074.ply"
      ],
      "points": 40954
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_083.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_083.ply"
      ],
      "points": 121418
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_096.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_096.ply"
      ],
      "points": 229455
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_100.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_100.ply"
      ],
      "points": 56977
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_123.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_123.ply"
      ],
      "points": 176741
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_129.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_129.ply"
      ],
      "points": 80490
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_131.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_131.ply"
      ],
      "points": 71007
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_141.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_141.ply"
      ],
      "points": 93630
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_160.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_160.ply"
      ],
      "points": 31731
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_164.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_164.ply"
      ],
      "points": 60917
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_169.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_169.ply"
      ],
      "points": 72055
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_170.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_170.ply"
      ],
      "points": 66475
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_171.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_171.ply"
      ],
      "points": 23920
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_a_184.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_a_184.ply"
      ],
      "points": 106576
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_b_006_.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_b_006_.ply"
      ],
      "points": 260662
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_b_017_.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_b_017_.ply"
      ],
      "points": 337401
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - quad_b_037_.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - quad_b_037_.ply"
      ],
      "points": 56615
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - rc_063_corrected.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - rc_063_corrected.ply"
      ],
      "points": 231337
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - rc_075_corrected.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - rc_075_corrected.ply"
      ],
      "points": 1157516
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - rc_077_corrected.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - rc_077_corrected.ply"
      ],
      "points": 192388
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - rc_079_corrected.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - rc_079_corrected.ply"
      ],
      "points": 412763
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - rc_089_corrected.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - rc_089_corrected.ply"
      ],
      "points": 830420
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - rc_172_corrected.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - rc_172_corrected.ply"
      ],
      "points": 270085
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - rc_173_corrected.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - rc_173_corrected.ply"
      ],
      "points": 581472
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/robsoncreek/trees/train/2018 - POINTCLOUDS - rc_174_corrected.ply",
        "sources/16875688/originals/robsoncreek/trees/val/2018 - POINTCLOUDS - rc_174_corrected.ply"
      ],
      "points": 124390
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "7307956"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_130.ply",
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_130.ply"
      ],
      "points": 899034
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "7307956"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_260.ply",
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_260.ply"
      ],
      "points": 1268892
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "7307956"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8399.ply",
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8399.ply"
      ],
      "points": 859105
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "7307956"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_222.ply",
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_222.ply"
      ],
      "points": 927685
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "7307956"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_384.ply",
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_384.ply"
      ],
      "points": 1321904
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "7307956"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_43.ply",
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_43.ply"
      ],
      "points": 1211517
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "7307956"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_56.ply",
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_56.ply"
      ],
      "points": 1043898
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1055.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1055.ply"
      ],
      "points": 138563
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1074.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1074.ply"
      ],
      "points": 1022747
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1090.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1090.ply"
      ],
      "points": 136448
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1195a.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1195a.ply"
      ],
      "points": 137158
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1195b.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1195b.ply"
      ],
      "points": 8935
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1195c.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1195c.ply"
      ],
      "points": 25849
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1271.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1271.ply"
      ],
      "points": 87109
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1339.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1339.ply"
      ],
      "points": 80346
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_134.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_134.ply"
      ],
      "points": 651282
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_138a.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_138a.ply"
      ],
      "points": 219109
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_138b.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_138b.ply"
      ],
      "points": 266341
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1438a.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1438a.ply"
      ],
      "points": 28749
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1438b.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1438b.ply"
      ],
      "points": 79383
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1532a.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1532a.ply"
      ],
      "points": 103987
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1532b.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1532b.ply"
      ],
      "points": 35880
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_1567.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_1567.ply"
      ],
      "points": 401231
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_2049a.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_2049a.ply"
      ],
      "points": 125277
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_221.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_221.ply"
      ],
      "points": 794439
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_2232.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_2232.ply"
      ],
      "points": 18269
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_2240.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_2240.ply"
      ],
      "points": 28690
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_286.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_286.ply"
      ],
      "points": 264753
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_29.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_29.ply"
      ],
      "points": 1692343
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_31.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_31.ply"
      ],
      "points": 954649
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_338.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_338.ply"
      ],
      "points": 1017699
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_353.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_353.ply"
      ],
      "points": 366296
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_70.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_70.ply"
      ],
      "points": 788891
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_700.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_700.ply"
      ],
      "points": 137481
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_8031.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_8031.ply"
      ],
      "points": 25264
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_8096.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_8096.ply"
      ],
      "points": 4299
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_8098.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_8098.ply"
      ],
      "points": 5321
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_8099a.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_8099a.ply"
      ],
      "points": 6894
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_8102.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_8102.ply"
      ],
      "points": 34893
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_8105b.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_8105b.ply"
      ],
      "points": 21022
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_8107d.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_8107d.ply"
      ],
      "points": 28312
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/wytham/trees/train/wytham_winter_913.ply",
        "sources/16875688/originals/wytham/trees/val/wytham_winter_913.ply"
      ],
      "points": 142628
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_009.ply",
        "sources/16875688/originals/ofental/trees/val/ot_009.ply"
      ],
      "points": 756358
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_013.ply",
        "sources/16875688/originals/ofental/trees/val/ot_013.ply"
      ],
      "points": 818696
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_008.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_008.ply"
      ],
      "points": 234984
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_009.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_009.ply"
      ],
      "points": 847000
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_018.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_018.ply"
      ],
      "points": 243560
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_019.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_019.ply"
      ],
      "points": 307186
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_020.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_020.ply"
      ],
      "points": 105828
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_057.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_057.ply"
      ],
      "points": 494995
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_068.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_068.ply"
      ],
      "points": 123764
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_090.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_090.ply"
      ],
      "points": 771186
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_092.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_092.ply"
      ],
      "points": 1099193
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_093.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_093.ply"
      ],
      "points": 667205
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_102.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_102.ply"
      ],
      "points": 606482
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_70.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_70.ply"
      ],
      "points": 57598
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_71.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_71.ply"
      ],
      "points": 1544622
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_72.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_72.ply"
      ],
      "points": 399157
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_73.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_73.ply"
      ],
      "points": 474009
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_74.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_74.ply"
      ],
      "points": 654423
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_75.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_75.ply"
      ],
      "points": 918608
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_76.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_76.ply"
      ],
      "points": 312461
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_77.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_77.ply"
      ],
      "points": 341738
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_78.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_78.ply"
      ],
      "points": 1139366
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_80.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_80.ply"
      ],
      "points": 67623
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_B_82.ply",
        "sources/16875688/originals/ofental/trees/val/ot_B_82.ply"
      ],
      "points": 522015
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_final_002.ply",
        "sources/16875688/originals/ofental/trees/val/ot_final_002.ply"
      ],
      "points": 1569222
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_final_027.ply",
        "sources/16875688/originals/ofental/trees/val/ot_final_027.ply"
      ],
      "points": 1192964
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/ofental/trees/train/ot_final_028.ply",
        "sources/16875688/originals/ofental/trees/val/ot_final_028.ply"
      ],
      "points": 1387389
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_20_-80_Boom6.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_20_-80_Boom6.ply"
      ],
      "points": 363245
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-100_Boom3.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-100_Boom3.ply"
      ],
      "points": 350491
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-100_Boom4.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-100_Boom4.ply"
      ],
      "points": 271283
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-60_Boom1.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-60_Boom1.ply"
      ],
      "points": 1473394
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "16875688",
        "16875688"
      ],
      "paths": [
        "sources/16875688/originals/litchfield/trees/train/tile_40_-80_Boom3.ply",
        "sources/16875688/originals/litchfield/trees/val/tile_40_-80_Boom3.ply"
      ],
      "points": 721016
    }
  ],
  "duplicate_examples": [
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_2053c.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_2053c.ply"
      ],
      "points": 46277
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1384.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1384.ply"
      ],
      "points": 67158
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8388.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_8388.ply"
      ],
      "points": 162802
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_8377.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_8377.ply"
      ],
      "points": 33137
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_354b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_354b.ply"
      ],
      "points": 419026
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_1596.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_1596.ply"
      ],
      "points": 39963
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_122a.ply",
        "sources/16875688/originals/wytham/trees/test/in_plot_th0.90/wytham_winter_122a.ply"
      ],
      "points": 187549
    },
    {
      "kind": "Identical normalized data",
      "records": [
        "7307956",
        "16875688"
      ],
      "paths": [
        "sources/7307956/originals/DATA_clouds_ply/DATA_clouds_ply/wytham_winter_712b.ply",
        "sources/16875688/originals/wytham/trees/test/out_plot_th0.90/wytham_winter_712b.ply"
      ],
      "points": 251142
    }
  ],
  "content_review": {
    "reviewed_at": "2026-10-17",
    "scope": "Source documentation, saved metadata and existing code; no new scientific admission",
    "model_sha256": "e5dc15d52c7c96218f0e9963e612c434d245bfefb780883180d5087a4c0d6ef2",
    "model_schema_sha256": "10b3e58b4fe2690c3c1a3e7336e2bfe00a3c9af58c060beeee56e757357b3307"
  },
  "evidence": [
    {
      "name": "Public content review and remaining questions",
      "url": "CONTENT-REVIEW.md"
    },
    {
      "name": "Pinned inventory",
      "path": "docs/lidar-acquisition-inventory.json"
    },
    {
      "name": "Acquisition and recovery log",
      "path": "docs/lidar-acquisition-log.md"
    },
    {
      "name": "Annotation definitions",
      "path": "docs/annotations.md"
    },
    {
      "name": "Training and generalization protocol",
      "path": "docs/lidar-training-data-plan.md"
    },
    {
      "name": "Prior provenance audit",
      "path": "docs/data-provenance-audit.md"
    }
  ],
  "audit_scope": {
    "metadata": "All 96 asset manifests, 15,400 stored-file records, 5,626 normalized cloud records and 48,177 chunk records.",
    "payload_samples": "Historical 2026-10-15 payload sample: 40 chunks / 17,102,064 points across 20 then-observed source field schemas; not rerun by this builder.",
    "limits": "No current full-payload reread, order-invariant geometry audit, scanner calibration validation, or final license admission. Duplicate groups are evidence for review, not deletion instructions.",
    "curation_applied": false
  },
  "snapshot_provenance": {
    "inventory_sha256": "a7d58ed8ba72a0aabe5576a94459fb52789d421336df42a3872d301e2d0b6e1b",
    "acquisition_status_sha256": "2210f4d07ef5c84c23ccc28111c1634d8613aeca53199c6a141f57dc9e641a5d",
    "builder": "scripts/build_knowledge_hub_catalog.py",
    "sample_audit_date": "2026-10-15"
  }
};

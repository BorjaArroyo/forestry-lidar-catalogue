# Experiment workspace: contracts and UX acceptance

Status: agreed design direction, consolidated on 2026-10-23; visual workspace
implementation corrected on 2026-10-25. Compact section views and contextual
subset configuration follow the selected concept over the existing independent
task routes. Shared multitask plans,
custom splits and fusion remain proposed. This specification does not change
scientific schemas, source admission, reference policies or historical evidence.

The [multitask coverage review](../reviews/MULTITASK-COVERAGE.md), dated
2026-10-26, analyzes concrete source candidates and records configurable partial
versus joint reference requirements, with their discovery and consumer implications.

## Scope

Prepare reproducible datasets through a persistent, potentially multitask
experiment. Segmentation and classification establish shared criteria for future
tasks, each retaining its own scientific requirements and validators.

Horizontal composition is the first priority. Fusion is an additional explicit
preparation when a reviewed pipeline establishes identity, spatial alignment and
temporal compatibility for the same observed state. Longitudinal analysis and
fusion across changing states are outside this scope.

## Current contract review

| Boundary               | Current authority and guarantee                                                                                                                                                       | Required evolution                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Sources and discovery  | [Knowledge model](../../data/knowledge-model.json), schema 1.4, source-task assessments and generated catalog; release identity and native semantics remain source-scoped.            | Multitask discovery and per-entity representation coverage.                                                                |
| Admission              | [Contributing](../../CONTRIBUTING.md) and [pipelines](../guides/PIPELINES.md); reviewed source/task routes, pinned implementations and scoped evidence.                               | Separate admission for new splits/fusions; configuring a route cannot admit it.                                            |
| Segmentation requests  | [Task planner](../../src/canopy/task_plan.py), source plans 1.0.0/1.1.0 and [dataset plans](../../schemas/dataset-plan.schema.json) 1.0.0/2.0.0.                                      | The planner fixes one task and provider partitions; shared experiments/custom splits need versioned contracts.             |
| Segmentation payloads  | [Task packages](../guides/TASK-PACKAGE.md), manifests 1.0.0/1.1.0 and [dataset folders](../guides/TASK-DATASET.md) 1.0.0; independent array/reference-policy checks.                  | Shared experiment metadata while preserving protected producer semantics and historical readers.                           |
| Classification         | [Classification guide](../guides/TREE-CLASSIFICATION.md), plan 3.0.0 and dataset `tree-classification-dataset:1.0.0`; rank-specific reference and separate sensor observations.       | Its planner, export and UI currently form a separate task route. Paired views are not fused clouds.                        |
| Measurements           | [Descriptors](../guides/DATA-MODEL.md#measurement-descriptors-and-input-requirements), units, channels, missingness and validity masks.                                               | Common shapes/wavelengths cannot substitute for cross-source compatibility evidence.                                       |
| Acquisition/local jobs | [Local service](../../src/canopy/service/), verified originals/extraction, durable jobs and one admitted job at a time.                                                               | Navigation must distinguish local worker lifetime from browser worker lifetime; leaving a view does not mean cancellation. |
| Browser recovery       | [Browser preparation](../guides/BROWSER-PREPARATION.md), task-specific drafts and runtime locks; segmentation Zenodo complete-plot checkpoints are revalidated, local inputs restart. | Shared contextual state without extending one route's resume guarantee to every task/input.                                |
| Consumption            | [SceneChunk](../../src/canopy/task_package.py) and [TreeDataset](../../src/canopy/classification/package.py), bounded blocks with identities and validity.                            | A common consumer description; storage blocks are not automatically training samples.                                      |
| Publication/versioning | Explicit allowlist, integrity locks, rejected unknown versions and [PR/CI policy](../../CONTRIBUTING.md).                                                                             | Version and migrate incompatible formats; preserve existing evidence and completed packages.                               |

FOR-instance and FGI-EMIT currently have enabled segmentation routes;
FOR-species20K and BioDiv-3DTrees have enabled classification routes. This does
not establish joint labels on the same samples, cross-source physical identity,
independent evaluation zones or an admitted fusion route. Current plans preserve
provider assignments and reject changed pinned dependencies.

## Shared experiment contract

An experiment records tasks/uses, selected releases and entities, preparation
routes and supported parameters, representations, split design, evidence mode
and output requirements. A reviewed execution plan freezes these decisions and
dependencies. A run and its validated results retain their exact plan.

Provider splits remain provenance. Experimental assignments are separate,
versioned decisions reusable across tasks through explicit entity relationships.
Task-specific exclusions explain their reasons without silently moving entities
to other splits. Preserve source-local IDs alongside any reviewed cross-source
relationship.

Each task declares its observation unit, required/optional inputs, targets and
validity, eligible uses, output structure and independent validator. Shared
criteria do not require identical payloads or eliminate task-specific code.
New task admission must also check the existing user journeys.

### Evaluation and uncertainty

| Profile                  | Intended question                                                                 |
| ------------------------ | --------------------------------------------------------------------------------- |
| A: local context         | Performance on new eligible entities within known locations.                      |
| B: similar new locations | Transfer to held-out locations under comparable conditions.                       |
| C: different conditions  | Transfer to explicitly held-out geographic, ecological or acquisition conditions. |

C is the long-term objective. Report profiles separately; success in one does
not imply success in another. Forest similarity and acquisition similarity are
separate dimensions. Declare grouping/separation rules, evidence and limitations;
geography alone does not certify independence.

Strict mode requires evidence for configured separation claims across relevant
inputs. Exploratory mode can retain unresolved scientific relationships, with
their effects identified before execution and in exports. Never switch silently.
Neither mode relaxes integrity, schema, unsafe-path, required-input or admission
checks. Unknown time cannot support a same-state fusion claim; exploratory mode
cannot enable an unadmitted route.

Concrete split algorithms, similarity descriptors, distance/temporal thresholds,
balancing rules and proportions remain to be specified. No global 70/15/15 rule
or optimization engine has been selected.

### Matching and representations

Keep physical entities, observations and derived representations distinct. A
storage alias adds no observation; a fused cloud adds no physical tree.
Relationships record type, endpoints, method, evidence, version and review state.
Distinguish documented identity, candidate overlap and admitted fusion. Similarity
or overlapping geometry alone does not establish the same tree. FOR-instance
v1/v2 correspondence remains unresolved until supported for specific captures.

Record acquisition time/interval, precision and provenance per observation;
publication time is not capture time. A fusion pipeline declares the evidence
needed to represent the same state, alignment, attribute/reference handling,
information loss and output lineage. Keep related originals and derivatives
linked when checking split separation.

Discovery distinguishes representations already supplied by a provider from
those an admitted pipeline can produce. Show affected-entity coverage rather
than implying that a capability covers every tree. Details explain matching,
time, alignment and unresolved conditions.

### Consumer description

Each exported view declares named inputs/targets, dtypes, shapes, axis meanings,
coordinate/measurement semantics, vocabularies, validity masks, missingness,
relationships, representation lineage and split membership. Distinguish absent
reference, invalid values, inapplicable fields and deliberately omitted variables.
Do not invent values or propagate labels implicitly.

A joint plot view may have point-level instance reference and tree-level taxonomy
with an explicit point/tree relation: targets need not share dimensions. Declare
the consumer sample unit and variable dimensions; file chunks remain storage
units. Sampling, granularity changes and dtype conversions belong to explicit
recipes. Requiring joint reference or permitting partial coverage is configurable
in the preparation and frozen in the recipe. Show coverage and exclusions for
each choice; no universal default has been selected. Requiring joint reference
must not silently remove scene context or relabel excluded trees as background.

Review shows the expected schema; a completed, independently validated run can
expose a real bounded sample. Keep the format framework-neutral and clear enough
to design downstream loaders. PyTorch implementation/testing is outside scope.

## Navigation contract

Use the selected **Experiment workspace**: direct section access and persistent
context. Global areas are Sources, Experiments, and Runs & outputs. Discovery
works before experiment creation; adding data to a draft preserves the return
route and discovery state.

| Experiment section | Responsibility                                                                  |
| ------------------ | ------------------------------------------------------------------------------- |
| Objectives         | Tasks, uses and requirements.                                                   |
| Data               | Per-task coverage, selected entities and contextual source details.             |
| Preparation        | Reviewed routes/parameters, representations and lineage.                        |
| Splits             | Shared assignments, evaluation intent, evidence mode and similarity dimensions. |
| Review             | Combined plan, expected consumer schema, exclusions and unresolved checks.      |

Runs & outputs owns progress, recovery and validated datasets, linked to the
exact plan and experiment context. Navigation is an acceptance condition:

1. Each view explains location, selection, remaining work and next action without
   requiring recall from another view. Select shared state once; preserve it
   across sections, details, Back/Forward, refresh and supported reopening.
2. Give navigable views meaningful URLs/history entries. Restoring a route must
   not execute a pipeline, restart a download or overwrite a draft silently.
3. Offer a normal route with relevant defaults and contextual advanced detail.
   A configurable contract field does not automatically become a visible input.
   The web configures admitted recipes; pipeline authorship/admission stays in Git.
4. Changes identify affected compatibility, split and plan decisions, preserve
   unaffected choices and require review where needed. Past results keep their plan.
5. Show coverage, incompatibilities and evidence gaps before payload intake.
   Blocked actions explain why and link to the section that can resolve it.
   Missing metadata proves neither incompatibility nor independence.
6. Distinguish draft, needs review, ready plan, running, interrupted, failed and
   validated output. Transfer, preparation and independent validation are separate
   phases; only completed validation permits a completed-result claim.
7. Browsing must not start or wait for long preparation work. Show loading,
   empty, failure and recovery states; explain the actual backend/input-specific
   Stop/Resume behavior. Preserve valid work only where checkpoints support it.
8. Support keyboard access, visible focus, labelled controls, status messages and
   responsive layouts. Essential actions/limitations require neither hover,
   horizontal page scrolling nor color-only interpretation.
9. Identify storage location/durability, browser eviction risk and the downloaded
   result's retention role. Navigation and cancellation are distinct actions.

## Walkthrough acceptance

The selected interactive concept was checked for navigation, task selection,
observation switching and evidence-mode changes at desktop/narrow widths. That
checks prototype behavior, not shipped-app usability or scientific readiness.
Validate these implemented journeys with representative users before closing UX:

| Journey             | Observable outcome                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Discover first      | Inspect a source/representation, add it to a draft and return with filters/selection intact.                                       |
| Segmentation        | Show selected entities, native reference policy and remaining checks without classification-only controls.                         |
| Classification      | Keep tree identity, modality, rank and validity explicit; paired views never appear as merged geometry.                            |
| Both tasks          | One experiment/shared split design; explicit per-task coverage, joint-reference requirements and exclusions.                       |
| Fusion opportunity  | Distinguish supplied fusion, documented pairs and candidate overlap; show temporal/alignment evidence and block unadmitted routes. |
| Change requirements | Keep unaffected choices, identify invalidated review decisions and offer direct correction without altering past results.          |
| Reopen/resume/fail  | Restore supported context, recheck plans/checkpoints where applicable and never present partial/corrupt output as validated.       |

## Delivery stages and remaining decisions

1. Consolidate this specification/current gaps and label historical documentation.
2. Implement workspace navigation and draft/run state over existing audited
   routes; check the journeys while preserving current exports/readers. The five
   sections, separate Runs & outputs, URL/history restoration, saved task
   preferences and retained form/worker nodes are implemented. Automated browser
   checks cover both tasks and narrow/desktop widths. The implementation uses
   global top navigation, contextual section navigation, a compact coverage table,
   bounded subset dialogs and an independent run view. Inactive sections have
   native hidden state; visibility does not depend on a cached stylesheet.
   Empty-selection gating, keyboard dismissal/focus, duplicate-subset errors,
   history, real classification exports and desktop page-height limits have
   regression coverage. Full-page screenshots of every section at both sizes
   accompany browser tests; [Data desktop](../ui/workspace-desktop.png),
   [Data mobile](../ui/workspace-mobile.png) and
   [Runs](../ui/workspace-runs-desktop.png) document the actual application.
   Representative-user
   walkthroughs and the joint-task journey remain open. Only added subsets are
   durable drafts; local file handles and unsaved source-control choices do not
   survive reload. Existing input-specific recovery limits still apply.
3. Version the shared experiment/consumer envelope after defining joint-reference
   policy and task-specific validation; specify historical-package compatibility.
4. Admit custom splits, new matching and same-state fusion through separate
   evidence-backed increments. Their exact schemas, parameters, resource budgets
   and migration rules remain open; UI selection is not scientific admission.

## Interaction precedents

These references inform UX, not scientific validity:

- [Airtable record review](https://support.airtable.com/articles/4384405105-airtable-interface-layout-record-review): contextual list/detail exploration.
- [Dataiku Flow](https://doc.dataiku.com/dss/latest/flow/index.html): datasets, recipes and lineage.
- [Galaxy histories](https://training.galaxyproject.org/training-material/topics/galaxy-interface/tutorials/history/tutorial.html): reproducible execution/output history.
- [GOV.UK task lists](https://design-system.service.gov.uk/components/task-list/): resumable complex work where users need control of task order; simplify the journey first.

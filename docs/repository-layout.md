# Repository layout

The root contains the project entrypoint, contributor documents and standard tool
configuration. Files belong in a directory according to their responsibility:

| Directory          | Contents                                                             |
| ------------------ | -------------------------------------------------------------------- |
| `data/`            | Canonical knowledge model and generated catalogue snapshots          |
| `schemas/`         | Domain JSON schemas, retaining their published identifiers and bytes |
| `src/canopy/`      | Maintained Python package                                            |
| `web/`             | Static catalogue, workbench and shared browser utilities             |
| `browser-prepare/` | Preparation worker, Python bridge and pinned runtime                 |
| `scripts/`         | CLI entrypoints, acquisition tools and protected scientific adapters |
| `docs/guides/`     | Canonical usage and contract guides                                  |
| `docs/sources/`    | Source-specific reviews                                              |
| `docs/reviews/`    | Repository content review                                            |
| `evidence/`        | Immutable scientific and execution records                           |
| `reviews/`         | Source admission records and the proposal template                   |
| `tests/`           | Automated tests and small fixtures                                   |
| `temp/`            | Ignored local working data, service state, caches and test reports   |

Retired prototypes, generic normalization code, compatibility entrypoints and their
unused dependencies are removed. They can be recovered from Git at the pre-cleanup
revision `4291fa7734f899db2446c9f7b4e3f84b4576fbc8`. The supported CLI is `canopy`.

The root documentation redirect stubs were removed. Maintained links now point directly
to the canonical guides. Schema bytes and scientific observations retain their meaning at their new
locations. The model no longer advertises a local implementation of the retired normalizer. Historical evidence and source admission records remain byte-identical;
their old path strings refer to their original checkout, not a silently rewritten record.

`node_modules/` is the standard local npm dependency directory and is ignored by Git.
`temp/` also contains resumable acquisitions and prepared data, so it must not be deleted
as a blanket cleanup. Tool caches and test output use `temp/cache/` and `temp/test-results/`.

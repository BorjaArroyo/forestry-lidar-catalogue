# Incremental delivery plan

## Main workflow · work in progress

The MVP must let a user choose a task, discover compatible public sources,
download the selected inputs and execute an audited transformation into a chosen
directory. This complete workflow is not available yet. The catalog, original
Zenodo acquisition and legacy source-aware normalization are existing pieces;
they do not establish a complete task-specific preparation workflow.

1. Finish one narrow task/source path end to end. State its required variables,
   reference unit, coverage, masks, units, losses and intended uses. Show why the
   selected source qualifies, with evidence and explicit unresolved conditions.
2. Connect that source selection to the exact version/assets needed for the task,
   resumable integrity-checked download and the chosen destination. Distinguish
   original-source retrieval from ready-to-use task data.
3. Admit a self-contained transformation only after prior analysis and validation
   of the full dataset-pipeline-task combination. Pin inputs, environment, code,
   configuration and outputs. Preserve originals and native labels.
4. Validate the complete user path and recovery behavior on real inputs. Keep it
   marked work in progress until that scope is demonstrated. Expand source/task
   coverage incrementally; never infer readiness from a matching file extension.

## Existing limited evidence

- Ten legacy source records have documentation/metadata reviews; they are not
  universally admitted for scientific use. New sources require prior analysis.
- The frozen Wytham diagnostic reference can be copied and hash-verified. This
  does not transform the raw acquisition or provide independent evaluation.
- A pinned TreeLearn Ray workflow ran on that frozen input. It is an in-source
  diagnostic, not a reproduced paper score or geographically independent result.
- The TLS duplicate-index CLI is validated for a 236-file subset; Workbench
  integration is pending and it does not delete or select canonical copies.

## Secondary work · deferred

Complete article audits, more benchmarks, registry expansion, geometric curation
and broader transfer graphs follow the main task-discovery-download-transform
workflow. Generic TreeLearn/ForestFormer3D recipes remain disabled. GitHub branch
protection and human admission reviews are separate outstanding governance work.

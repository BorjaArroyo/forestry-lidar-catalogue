# Historical container prototype

This directory contains a retained WASI container experiment and its fixtures.
It is not part of the active catalog or browser-preparation dependency graph.

The active application imports the bounded provider download and MD5 helpers
from `web/shared/`. The modules in this directory re-export those helpers only
for the historical prototype. The prototype worker, UI and WASI shim retain
their original execution limits and do not prepare production datasets.

Its runtime lock, licenses and small LAS fixtures remain available for
historical regression checks. Do not use this prototype as a task-data
preparation path.

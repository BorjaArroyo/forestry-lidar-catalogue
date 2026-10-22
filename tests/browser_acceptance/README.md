# Manual browser-process restart acceptance

This optional network acceptance uses the shipped worker, explicit five-plot
selection in `selection.json`, and unchanged native scientific validation. It is
not part of routine CI and requires no browser automation dependency. Python uses
the repository's pinned requirements. Run Chromium and Firefox sequentially.

1. By default, use a new, exclusive browser profile in a task-owned temporary directory.
   Record the actual browser version and profile path locally. Do not quit or
   reset a user's ordinary profile. Keep the same loopback port across restart.
2. Check host free space before intake: allow the plan's browser-space estimate
   plus a downloaded ZIP, browser/runtime files and a validation reserve. Do not
   bypass a failed host or browser quota check. Remove only task-owned artifacts
   after recording their validation reports.
3. From the repository root, run:

   ```bash
   python tests/browser_acceptance/server.py --port 8893 --output temp/acceptance-chromium
   ```

   The output directory must be new. For Firefox, restart the server on the same
   port with a different new output directory. It serves the publication allowlist
   and three explicit acceptance files; capture endpoints exist only on loopback.
4. Open `http://127.0.0.1:8893/tests/browser_acceptance/` in the test profile.
   Click **Review five-plot plan**. The harness exports and re-imports the plan through a fresh production worker before enabling preparation. Then click **Prepare and interrupt after first
   checkpoint**. The harness terminates the worker immediately on its first
   committed checkpoint, before waiting for telemetry. Save the resulting event
   log, job identity and displayed interruption status.
5. Quit the entire test browser process. Confirm it exited, relaunch exactly the
   same profile and open `http://127.0.0.1:8893/#workbench`. Verify one saved plot
   is discovered, then click **Resume**. No form selection needs restoration.
6. After validation, return to the acceptance page in the same profile and use
   **Inspect acceptance result**. Save the ZIP through the browser's download
   link, or capture the same File with **Save accepted ZIP to test server**.
   A captured archive uses its job UUID as its filename and never overwrites an
   existing archive. Interrupted captures retain an `.incomplete` suffix.
7. Validate the complete downloaded/captured ZIP:

   ```bash
   python tests/browser_acceptance/validate_download.py /absolute/accepted.zip \
     --report temp/acceptance-chromium/native-validation.json
   ```

   The native validator checks CRC, all dataset/package policies and arrays, and
   exact equality of the 39 block hashes with the existing native evidence. It
   materializes one complete NPZ at a time and calls the unchanged native reader;
   no semantic, provenance or checksum check is replaced.
8. Record process-exit/relaunch evidence, browser version, runtime and UI hashes,
   plan, plots, points, native report and limitations. Stop the server. Once the
   browser process is stopped and reports are preserved, remove only that test
   profile and its generated archives. Repeat with the other browser.

For a deployed-site smoke test, use Workbench at its real subpath, prepare the
smallest reviewed FOR-instance plot with inference use, reload and recover its
ZIP. Validate the dataset with the native reader; compare each selected chunk
with its corresponding scene in the native reference evidence. Do not use the
five-plot exact-membership checker for a one-plot smoke test.

Refresh existing local fingerprints explicitly with
`python -m canopy publication --write`, then verify with the same command
without `--write`. New public files must first be added to the publication
allowlist; the checker does not discover or admit files automatically. External
runtime URLs and source pins are never updated by this command.

If the user explicitly requests the usual Firefox profile, use its built-in
**Restart normally** action at `about:profiles` to preserve the session. Do not
change startup preferences or delete the normal profile. Record that this is
the requested profile exception, the old/new browser process IDs, and that the
existing tabs were retained. Delete only the exact task-created acceptance run.

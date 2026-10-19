# Browser container feasibility experiment

The experimental page under `container-lab/` executes a fixed, read-only LAS
inspection operation inside a Python/Linux/x86-64 container converted upstream
by container2wasm. The emulator is Bochs compiled to WASI. Browser JavaScript
provides WASI file descriptors and a Web Worker; Python performs the LAS parsing.
This is actual container execution on WebAssembly, not a JavaScript LAS parser.

## Evidence and boundaries

A native Python reference and Node WASI execution agreed on the golden fixture's
input SHA256, three points and decoded XYZ bounds, including projected-scale
coordinate precision. The Firefox static-page test displayed completed execution
and the expected input and operation hashes. The guest reports Python 3.11.5,
Linux and x86_64. Host artifact hashes and scope are included in the JSON report.

The operation supports coordinate inspection of uncompressed LAS 1.0-1.4,
point formats 0-10, up to 1 MiB. It checks signature, header/record lengths,
compression flags, numeric scales, point count and decoded coordinate bounds.
It does not validate all LAS structures, annotation meanings, multispectral
calibration, complete dataset coverage or a preparation pipeline. Its File input
and synthetic example use the same read-only virtual mapping. Source files are
not modified. Invalid input produces an explicit error; cancellation terminates
the worker. The 120-second timeout also terminates it. Browser jobs do not resume
or survive closing the page.

## Runtime and filesystem

The first runtime download totals 145,588,571 bytes across three pinned upstream
chunks. Initial WASM linear memory is 256,114,688 bytes; this excludes downloads,
JavaScript buffers and browser overhead. These are prototype costs, not a
measurement of total resident process memory or proof of multi-GB scalability.

Only the selected LAS and the fixed inspector are mapped into the container.
No arbitrary host paths, Docker socket, local HTTP API or container networking
are exposed. The page fetches runtime artifacts and its code; selected data is
not uploaded. The report is exported through a normal browser download, without
requiring File System Access directory-picker support.

## Reuse and provenance limits

`runtime-lock.json` identifies upstream `ktock/demo-images` commit
`9ff24d9e8e1fa9873ce31176706bf431d48770ac`, the exact chunk and assembled hashes,
the operation fingerprint and browser_wasi_shim 0.4.2. The official demo identifies
its source container recipe as `python:3.11-alpine`; its source image digest and
converter version were not recorded upstream. The opaque converted runtime is
therefore pinned for this experiment but is not an admitted reproducible
production environment. Building a maintained image from digest-pinned source
and converter inputs is still required before any source-preparation admission.

Runtime binaries are fetched from immutable upstream URLs and are not committed
here. Upstream code and runtime licensing: https://github.com/ktock/container2wasm-demo
and https://github.com/container2wasm/container2wasm. The vendored WASI shim is
MIT/Apache-2.0; its license files are retained. The synthetic LAS is generated
locally and contains no provider data.

## Next acceptance checks

Verify the public GitHub Pages route in Firefox, file selection and report
export. Then test a bounded real LAS subset and output equivalence before
considering streaming, complete source downloads or dataset transformations.
Existing local preparation remains a separate path; this prototype does not
make public-site local-directory forms operational.

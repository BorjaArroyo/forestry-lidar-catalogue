import { WASI, File, OpenFile, PreopenDirectory, ConsoleStdout } from './wasi-shim/dist/index.js';
const WASM_SHA = 'ed78cdc4ab4e1334ec7396eda4db5bc058e4e42825142af06096e1fd762275e3';
const hex = (data) =>
  Array.from(new Uint8Array(data), (b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));
self.onmessage = async ({ data }) => {
  const started = performance.now();
  try {
    const input = new Uint8Array(data.input);
    if (input.byteLength > 1048576) throw Error('Prototype input limit is 1 MiB');
    const inputSha = await sha(input);
    const phase = (text) => self.postMessage({ type: 'phase', text });
    phase('Loading pinned upstream container runtime (145.6 MB)…');
    const artifacts = await (await fetch('./runtime-lock.json')).json();
    const parts = await Promise.all(
      artifacts.files.map(async (part) => {
        const response = await fetch(artifacts.base_url + part.path);
        if (!response.ok) throw Error('Runtime HTTP ' + response.status);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength !== part.size_bytes || (await sha(bytes)) !== part.sha256)
          throw Error('Runtime chunk checksum mismatch');
        return bytes;
      }),
    );
    const joined = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
    let offset = 0;
    for (const part of parts) {
      joined.set(new Uint8Array(part), offset);
      offset += part.byteLength;
    }
    const wasm = joined.buffer;
    phase('Compiling verified WebAssembly…');
    if ((await sha(wasm)) !== WASM_SHA) throw Error('Uncompressed runtime checksum mismatch');
    const script = await (await fetch('./inspect_las.py')).arrayBuffer();
    const scriptSha = await sha(script);
    if (scriptSha !== artifacts.operation_sha256) throw Error('Operation checksum mismatch');
    let output = '';
    const stdout = new ConsoleStdout((bytes) => {
      output += new TextDecoder().decode(bytes);
      if (output.length > 65536) throw Error('Container output limit exceeded');
    });
    const wasi = new WASI(
      ['canopy', '-no-stdin', '-entrypoint', 'python3', '/work/inspect_las.py', '/work/input.las'],
      ['LANG=C.UTF-8'],
      [
        new OpenFile(new File(new Uint8Array())),
        stdout,
        stdout,
        new PreopenDirectory(
          '/work',
          new Map([
            ['inspect_las.py', new File(script, { readonly: true })],
            ['input.las', new File(input, { readonly: true })],
          ]),
        ),
      ],
    );
    const compiled = await WebAssembly.compile(wasm);
    const instance = await WebAssembly.instantiate(compiled, {
      wasi_snapshot_preview1: wasi.wasiImport,
    });
    const initialMemory = instance.exports.memory.buffer.byteLength;
    phase('Executing Python inside the emulated Linux container…');
    const status = wasi.start(instance);
    const match = output.match(/CANOPY_RESULT=(\{[^\n]*\})/);
    if (!match) throw Error('Container produced no report: ' + output.slice(-1500));
    const result = JSON.parse(match[1]);
    if (!result.ok) throw Error(result.error);
    if (result.report.input_sha256 !== inputSha) throw Error('Container/input checksum mismatch');
    if (status !== 0) throw Error('WASI exit status ' + status);
    self.postMessage({
      type: 'result',
      evidence: {
        schema_version: '0.1',
        engine: 'container2wasm-wasi-bochs',
        runtime_sha256: WASM_SHA,
        runtime_source: artifacts.base_url,
        operation_sha256: scriptSha,
        input_sha256: inputSha,
        report: result.report,
        metrics: {
          elapsed_ms: performance.now() - started,
          downloaded_runtime_bytes: wasm.byteLength,
          uncompressed_runtime_bytes: wasm.byteLength,
          wasm_memory_initial_bytes: initialMemory,
          wasm_memory_final_bytes: instance.exports.memory.buffer.byteLength,
        },
        scope:
          'Browser proof of concept, not dataset preparation or calibrated multispectral processing.',
      },
    });
  } catch (error) {
    self.postMessage({ type: 'error', error: String(error.message || error) });
  }
};

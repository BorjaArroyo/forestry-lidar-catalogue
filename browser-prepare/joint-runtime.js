/* Exact source and execution dependencies for linked point/tree references. */
import { createRuntime } from './runtime.js';
import { sha256, loadTools } from './classification-runtime.js';

export async function loadJointContext(scope, phase = () => {}) {
  const base = new URL('../', import.meta.url);
  const nativeFetch = scope.fetch.bind(scope);
  const response = await nativeFetch(new URL('browser-prepare/joint-runtime-lock.json', base), {
    cache: 'no-store',
  });
  if (!response.ok) throw Error('Joint execution dependencies are unavailable');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const lock = JSON.parse(new TextDecoder().decode(bytes));
  if (lock.schema_version !== '1.0.0') throw Error('Unsupported joint execution dependencies');
  const assets = new Map();
  for (const [name, entry] of Object.entries(lock.files)) {
    const result = await nativeFetch(new URL(entry.path, base), { cache: 'no-cache' });
    if (!result.ok) throw Error('Joint dependency unavailable: ' + name);
    const data = new Uint8Array(await result.arrayBuffer());
    if (data.length !== entry.size_bytes || (await sha256(data)) !== entry.sha256)
      throw Error('Joint dependency changed: ' + name);
    assets.set(name, data);
  }
  const read = async (name) => {
    if (!assets.has(name)) throw Error('Unpinned joint execution dependency: ' + name);
    return assets.get(name);
  };
  const json = async (name) => JSON.parse(new TextDecoder().decode(await read(name)));
  const source = await json('data/joint/source-lock.json');
  const runtime = createRuntime({ scope, base, nativeFetch, digest: sha256, phase });
  return {
    source,
    nativeFetch,
    runtimeHash: await sha256(bytes),
    async boot() {
      phase('Starting the pinned Python/NumPy runtime…');
      const py = await runtime.boot(await json('browser-prepare/runtime-lock.json'));
      py.globals.set('joint_source_json', JSON.stringify(source));
      py.globals.set('joint_runtime_sha256', await sha256(bytes));
      py.runPython(
        'from canopy.joint.model import resolve as resolve_joint, check as check_joint, require_admitted; from canopy.joint.package import Preparation as JointPreparation, JointDataset; joint_source = json.loads(joint_source_json)',
      );
      return py;
    },
    tools: () => loadTools(read),
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const publication = JSON.parse(fs.readFileSync(new URL('publication-manifest.json', root))).files;
const runtime = JSON.parse(fs.readFileSync(new URL('browser-prepare/runtime-lock.json', root))).files;

function dependencies(entry, seen = new Set()) {
  const url = new URL(entry, root);
  url.search = '';
  const name = path.relative(fileURLToPath(root), fileURLToPath(url)).replaceAll(path.sep, '/');
  if (seen.has(name)) return seen;
  assert.ok(fs.existsSync(url), `Missing module ${name}`);
  seen.add(name);
  const text = fs.readFileSync(url, 'utf8');
  for (const match of text.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith('.')) dependencies(new URL(match[1], url).href, seen);
  }
  return seen;
}

test('the application and worker module graphs have explicit publication entries', () => {
  for (const name of dependencies('web/bootstrap.js')) assert.ok(Object.hasOwn(publication, name), `Unpublished application module ${name}`);
  for (const name of dependencies('browser-prepare/worker.js')) {
    assert.ok(Object.hasOwn(publication, name), `Unpublished worker module ${name}`);
    assert.ok(Object.hasOwn(runtime, name), `Unpinned worker module ${name}`);
    assert.ok(!name.startsWith('container-lab/'), `Active worker imports historical prototype ${name}`);
  }
});

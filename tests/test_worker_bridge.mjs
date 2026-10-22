import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { IMPORT_PLAN_CODE } from '../browser-prepare/review.js';

const bridge = `
import json, sys
from types import SimpleNamespace
imported_plan_text = sys.stdin.read()
task_model, source_contexts, runtime_lock_sha256 = {}, {}, 'fixture'
dataset_plan = SimpleNamespace(check_dataset=lambda model, sources, plan, **kwargs: plan)
exec(sys.argv[1])
print(json.dumps(execution_plan))
`;

const venvPython = '.venv/bin/python';
const candidates = [
  process.env.CANOPY_PYTHON,
  process.env.VIRTUAL_ENV && `${process.env.VIRTUAL_ENV}/bin/python`,
  existsSync(venvPython) && venvPython,
  'python3',
];
const python = candidates.find(Boolean);

test('the production import bridge resolves the packaged decoder and rejects duplicate keys', () => {
  const execute = (input) =>
    spawnSync(python, ['-c', bridge, IMPORT_PLAN_CODE], {
      input,
      encoding: 'utf8',
    });
  const valid = execute('{"schema_version":"2.0.0"}');
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), { schema_version: '2.0.0' });
  const duplicate = execute('{"schema_version":"1.0.0","schema_version":"2.0.0"}');
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /Duplicate JSON key/);
});

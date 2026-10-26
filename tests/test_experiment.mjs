import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeExperiment,
  experimentFromUrl,
  experimentToUrl,
  referenceFor,
  jointSources,
  coveragePreview,
  jointBlockers,
} from '../web/experiment.js';

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
const draft = (update = {}) =>
  normalizeExperiment(
    { schema_version: '1.0.0', tasks: ['instances', 'species'], sources: ['19127709'], ...update },
    catalog,
  );

test('a raw species field cannot establish a taxonomy mapping or joint candidate', () => {
  const source = catalog.datasets.find((d) => d.id === '8287792');
  assert.equal(referenceFor(source, 'species').reported, false);
  assert.deepEqual(
    jointSources(catalog).map((source) => source.id),
    ['19127709'],
  );
});

test('malformed or future drafts cannot restore unknown targets, sources or policy', () => {
  assert.deepEqual(
    draft({ tasks: {}, sources: ['8287792', '19127709', '19127709', '../bad'], policy: 'ready' })
      .sources,
    ['19127709'],
  );
  assert.deepEqual(draft({ tasks: {} }).tasks, ['instances']);
  assert.equal(
    normalizeExperiment({ schema_version: '999', tasks: ['species'] }, catalog).policy,
    null,
  );
});

test('candidate intersections use rank and crown coverage without asserting validated output', () => {
  assert.deepEqual(coveragePreview(draft({ policy: 'partial' })), {
    total: 10447,
    taxonomy: 6938,
    retained: 10447,
    excluded: 0,
    validated: false,
  });
  assert.equal(coveragePreview(draft({ policy: 'joint' })).excluded, 3509);
  assert.equal(
    coveragePreview(draft({ policy: 'joint', rank: 'genus', completeCrowns: true })).retained,
    7393,
  );
  assert.equal(coveragePreview(draft({ policy: 'joint', completeCrowns: true })).retained, 6867);
  assert.equal(coveragePreview(draft({ sources: [] })), null);
  assert(jointBlockers(draft({ policy: 'joint' })).some((reason) => reason.includes('No joint')));
});

test('shared configuration round-trips in history URLs and explicit single-task routes override it', () => {
  const original = draft({ policy: 'partial', rank: 'genus', completeCrowns: true });
  const params = new URLSearchParams();
  experimentToUrl(params, original);
  assert.deepEqual(
    experimentFromUrl(params, draft({ sources: [] }), catalog, 'instances'),
    original,
  );
  assert.deepEqual(
    experimentFromUrl(new URLSearchParams('task=species'), original, catalog, 'species', true)
      .tasks,
    ['species'],
  );
  assert.deepEqual(
    experimentFromUrl(new URLSearchParams(), original, catalog, 'instances', true),
    original,
  );
});

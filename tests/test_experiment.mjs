import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeExperiment,
  experimentFromUrl,
  experimentToUrl,
  referenceFor,
  jointSources,
} from '../web/experiment.js';

import { jointCoverage } from '../web/joint-workspace.js';
const source = JSON.parse(readFileSync(new URL('../data/joint/source-lock.json', import.meta.url)));

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

test('audited coverage measures actual tree labels at the chosen classification level', () => {
  const request = {
    plots: source.plots.map((p) => p.path),
    target: 'species',
    policy: 'partial',
    complete_crowns: false,
  };
  const partial = jointCoverage(source, request);
  assert.equal(partial.total, 61);
  assert.equal(partial.eligible, 61);
  assert.equal(partial.taxonomy, 32);
  assert.equal(jointCoverage(source, { ...request, policy: 'joint' }).eligible, 32);
  assert.equal(jointCoverage(source, { ...request, target: 'genus' }).taxonomy, 40);
  assert.equal(jointCoverage(source, { ...request, target: 'leaf_group' }).taxonomy, 40);
  assert.equal(jointCoverage(source, { ...request, plots: [] }).points, 0);
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

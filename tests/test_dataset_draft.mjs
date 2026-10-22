import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTaskSelection } from '../web/catalog/task-selection.js';
import { emptyDraft, readDraft, addSubset, reviewDraft } from '../browser-prepare/dataset-draft.js';
import { profileForPipeline } from '../browser-prepare/profiles.js';
const catalog = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const selection = createTaskSelection(catalog);
const source = JSON.parse(
  fs.readFileSync(new URL('../scripts/for_instance/source-lock.json', import.meta.url), 'utf8'),
);
const plots = source.plots.map((p) => ({
  ...p,
  collection: p.path.split('/FORinstance_dataset/')[1].split('/')[0],
}));
const request = selection.normalize('inference');
const subset = (paths) => ({
  record_id: '8287792',
  pipeline_ref: 'pipeline:for-instance-plot-instances:1.0.0',
  paths,
  collections: [...new Set(paths.map((path) => plots.find((p) => p.path === path).collection))],
  partitions: [...new Set(paths.map((path) => plots.find((p) => p.path === path).published_split))],
});
const review = (draft, overrides = {}) =>
  reviewDraft(draft, {
    request,
    assess: selection.assess,
    sourcePlots: () => plots,
    hasProfile: (id) => Boolean(profileForPipeline(id)),
    ...overrides,
  });

test('saved subsets survive a round trip and overlapping scenes are retrieved once', () => {
  const first = plots[0].path,
    second = plots[1].path;
  let draft = addSubset(emptyDraft(request), request, subset([first]));
  draft = addSubset(draft, request, subset([first, second]));
  draft = readDraft(JSON.stringify(draft), selection.normalize);
  const result = review(draft);
  assert.deepEqual(result.paths, [first, second]);
  assert.equal(result.overlaps, 1);
  assert.equal(result.points, plots[0].points + plots[1].points);
  assert.equal(draft.subsets.length, 2);
});
test('removing a subset preserves scenes still selected by another subset', () => {
  const first = plots[0].path,
    second = plots[1].path;
  let draft = addSubset(emptyDraft(request), request, subset([first, second]));
  draft = addSubset(draft, request, subset([first]));
  draft.subsets = draft.subsets.slice(1);
  assert.deepEqual(review(draft).paths, [first]);
});
test('duplicate selections and changed requests cannot silently extend the draft', () => {
  const paths = [plots[0].path, plots[1].path];
  const draft = addSubset(emptyDraft(request), request, subset(paths));
  assert.throws(() => addSubset(draft, request, subset([...paths].reverse())), /already/);
  assert.throws(
    () => addSubset(draft, selection.normalize('training'), subset([plots[2].path])),
    /requirements/,
  );
  assert.throws(
    () => review(draft, { request: selection.normalize('training') }),
    /Requirements changed/,
  );
});
test('unknown versions, fields, malformed requirements and duplicate paths fail closed', () => {
  const valid = addSubset(emptyDraft(request), request, subset([plots[0].path]));
  for (const mutate of [
    (d) => (d.schema_version = '9.0.0'),
    (d) => (d.unexpected = true),
    (d) => (d.request.variables.rgb = 'required'),
    (d) => d.subsets[0].paths.push(d.subsets[0].paths[0]),
    (d) => (d.subsets[0].record_id = '../escape'),
  ]) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.throws(() => readDraft(JSON.stringify(changed), selection.normalize));
  }
});
test('retired pipelines, absent paths and excluded partitions cannot execute', () => {
  const valid = addSubset(emptyDraft(request), request, subset([plots[0].path]));
  let changed = structuredClone(valid);
  changed.subsets[0].pipeline_ref = 'pipeline:retired';
  assert.throws(() => review(changed), /pipeline changed/);
  changed = structuredClone(valid);
  changed.subsets[0].paths = ['absent.las'];
  assert.throws(() => review(changed), /absent/);
  const testPlot = plots.find((p) => p.published_split === 'test');
  changed = addSubset(
    emptyDraft(selection.normalize('training')),
    selection.normalize('training'),
    subset([testPlot.path]),
  );
  assert.throws(() => review(changed, { request: selection.normalize('training') }), /excluded/);
});

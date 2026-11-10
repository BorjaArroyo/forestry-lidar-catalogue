import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { sourceOverview } from '../web/catalog/source-overview.js';
const catalog = JSON.parse(fs.readFileSync(new URL('../data/catalog.json', import.meta.url)));
const joint = JSON.parse(
  fs.readFileSync(new URL('../data/joint/source-lock.json', import.meta.url)),
);
test('all enabled routes are discoverable independently of the active experiment', () => {
  const summaries = catalog.datasets.map((source) => sourceOverview(catalog, source, joint));
  assert.equal(summaries.filter((s) => s.preparation.status === 'ready').length, 5);
  const tree = summaries[catalog.datasets.findIndex((source) => source.id === '19127709')];
  assert.equal(tree.routes.length, 1);
  assert.deepEqual(tree.routes[0].tasks, ['instances', 'species']);
  assert.match(tree.preparation.detail, /6 admitted plots/);
  assert.match(tree.preparation.detail, /whole-release/i);
});
test('missing generated preparation metadata cannot invent an enabled route', () => {
  const source = catalog.datasets.find((s) => s.id === '19127709');
  assert.equal(sourceOverview({ ...catalog, preparations: [] }, source).routes.length, 0);
  const restricted = catalog.datasets.find((s) => s.id === '15193973');
  assert.equal(sourceOverview(catalog, restricted).preparation.status, 'blocked');
});

test('public source exports exclude local observations and preserve the selected scope', async () => {
  const { exportSources, sourcesCSV } = await import('../web/catalog/source-overview.js');
  const source = catalog.datasets.find((s) => s.id === '19127709');
  const exported = exportSources(catalog, [source], joint);
  assert.equal(exported.schema_version, '2.0.0');
  assert.equal(exported.sources.length, 1);
  assert.ok('coverage_summary' in exported.sources[0]);
  assert.ok(Array.isArray(exported.sources[0].evidence.preparation));
  assert.equal(exported.sources[0].preparations[0].tasks.length, 2);
  for (const field of ['cloud_count', 'points', 'chunks', 'example_paths', 'source_fields'])
    assert.equal(field in exported.sources[0], false);
  const csv = sourcesCSV({
    sources: [{ name: 'A, "quoted" name', open_questions: ['Unknown units', 'Unknown datum'] }],
  });
  assert.ok(csv.includes('"A, ""quoted"" name"'));
  assert.ok(csv.includes('Unknown units; Unknown datum'));
});

test('historical FOR-instance species fields do not establish public taxonomy', () => {
  const source = catalog.datasets.find((s) => s.id === '8287792');
  const overview = sourceOverview(catalog, source, joint);
  assert.equal(overview.taskSupport.species.status, 'not_documented');
  assert.ok(!overview.references.includes('Tree species'));
  assert.equal(
    catalog.datasets.filter((s) =>
      ['partial', 'documented'].includes(
        sourceOverview(catalog, s, joint).taskSupport.species.status,
      ),
    ).length,
    3,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  layoutTaskGraph,
  projectTaskGraph,
  visibleTasks,
  wrapLabel,
} from '../web/catalog/model-graph.js';

const model = JSON.parse(fs.readFileSync(new URL('../data/knowledge-model.json', import.meta.url)));
const taskId = 'task:instances';
const project = (options) => projectTaskGraph(model, taskId, options);

test('admitted routes have unique typed nodes and preserve canonical flow roles', () => {
  const graph = project();
  assert.equal(graph.pipelineCount, 2);
  assert.equal(graph.nodes.length, new Set(graph.nodes.map((node) => node.id)).size);
  assert.deepEqual(
    graph.nodes.filter((node) => node.type === 'source_release').map((node) => node.name),
    ['FOR-instance', 'FGI-EMIT'],
  );
  assert.equal(graph.nodes.filter((node) => node.type === 'transformation').length, 2);
  assert.ok(!graph.nodes.some((node) => node.id.includes('existing-normalization')));
  const input = graph.edges.filter((edge) => edge.role === 'consumes');
  const output = graph.edges.filter((edge) => edge.role === 'produces');
  assert.equal(input.length, 2);
  assert.equal(output.length, 2);
  for (const edge of [...input, ...output])
    assert.deepEqual(edge, { id: edge.id, ...model.edges[edge.id], kind: 'flow' });
  assert.ok(input.every((edge) => edge.target.includes('-native:')));
  assert.ok(output.every((edge) => edge.target.includes('-plot-instances:')));
  assert.ok(
    graph.edges
      .filter((edge) => edge.kind === 'requires')
      .every((edge) => edge.role === 'requires'),
  );
});

test('reported support expands discovery without granting execution or duplicating sources', () => {
  const graph = project({ includeReported: true });
  assert.equal(graph.nodes.filter((node) => node.type === 'source_release').length, 12);
  assert.equal(graph.reportedCount, 10);
  assert.equal(graph.edges.filter((edge) => edge.kind === 'support').length, 10);
  assert.equal(graph.pipelineCount, 2);
  assert.equal(graph.nodes.length, new Set(graph.nodes.map((node) => node.id)).size);
});

test('task visibility and disabled preparation remain authoritative', () => {
  assert.deepEqual(
    visibleTasks(model).map(([id]) => id),
    [taskId, 'task:species'],
  );
  assert.throws(() => projectTaskGraph(model, 'task:components'), /unavailable/);
  const changed = structuredClone(model);
  for (const node of Object.values(changed.nodes))
    if (node.type === 'pipeline_spec') node.data.execution_enabled = false;
  const graph = projectTaskGraph(changed, taskId);
  assert.equal(graph.pipelineCount, 0);
  assert.equal(graph.nodes.filter((node) => node.type === 'source_release').length, 0);
  assert.equal(projectTaskGraph(changed, taskId, { includeReported: true }).reportedCount, 12);
  assert.ok(layoutTaskGraph(graph).bounds.height > 0);
});

test('layout remains deterministic and disjoint with long names and reported support', () => {
  const changed = structuredClone(model);
  changed.nodes['zenodo:8287792'].data.profile.name = 'An exceptionally long source name '.repeat(
    12,
  );
  const projection = projectTaskGraph(changed, taskId, { includeReported: true });
  const graph = layoutTaskGraph(projection);
  assert.deepEqual(graph, layoutTaskGraph(projection));
  for (let i = 0; i < graph.nodes.length; i++) {
    const a = graph.nodes[i];
    assert.ok(a.lines.length <= 3);
    assert.ok(a.x >= graph.bounds.x && a.x + a.w <= graph.bounds.x + graph.bounds.width);
    for (const b of graph.nodes.slice(i + 1)) {
      assert.ok(
        a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y,
        `${a.id} overlaps ${b.id}`,
      );
    }
  }
  const source = graph.nodes.find((node) => node.id === 'zenodo:8287792');
  assert.equal(source.name, changed.nodes[source.id].data.profile.name);
  assert.ok(source.lines.at(-1).endsWith('…'));
  assert.ok(
    wrapLabel('W'.repeat(200), 40, (text) => text.length * 10).every((line) => line.length <= 4),
  );
});

test('shared contracts and repeated pipeline membership stay unique', () => {
  const changed = structuredClone(model);
  changed.nodes['pipeline:duplicate-route'] = structuredClone(
    changed.nodes['pipeline:for-instance-plot-instances:1.0.0'],
  );
  const graph = projectTaskGraph(changed, taskId);
  assert.equal(graph.nodes.length, project().nodes.length);
  assert.equal(graph.edges.length, project().edges.length);
});

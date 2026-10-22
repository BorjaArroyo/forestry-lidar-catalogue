/* Renders the reviewed knowledge graph per task. The model is data, not a promise. */
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );

export function mountModelView({
  document: doc = document,
  fetch: doFetch = (...args) => fetch(...args),
} = {}) {
  const $ = (selector) => doc.querySelector(selector);
  const state = { task: 'instances', selected: null, model: null, load: null };
  const SUPPORT_COLORS = {
    documented: '#3f8972',
    partial: '#c19b4b',
    not_documented: '#a4ac9c',
    unsupported: '#ba7e70',
    derived_only: '#917ba4',
  };
  async function load() {
    if (!state.load)
      state.load = doFetch('data/knowledge-model.json', { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw Error(`Knowledge model HTTP ${response.status}`);
          return response.json();
        })
        .catch((error) => {
          state.load = null;
          throw error;
        });
    return state.load;
  }
  const flows = (model) => Object.values(model.edges).filter((edge) => edge.type === 'data_flow');
  const supportsOf = (model, taskId) =>
    Object.entries(model.edges)
      .filter(([, edge]) => edge.type === 'task_support' && edge.target === taskId)
      .map(([id, edge]) => ({ id, source: edge.source, target: edge.target, data: edge.data }));
  /* The audited preparation chain: source → native contract → pipeline → task contract. */
  function preparationChain(model, taskId) {
    const packages = new Set(
      flows(model)
        .filter((edge) => edge.target === taskId)
        .map((edge) => edge.source),
    );
    const pipelines = new Set(
      flows(model)
        .filter((edge) => packages.has(edge.target))
        .map((edge) => edge.source),
    );
    const natives = new Set(
      flows(model)
        .filter((edge) => pipelines.has(edge.source))
        .map((edge) => edge.target)
        .filter((id) => model.nodes[id]?.type === 'data_contract'),
    );
    const sources = new Set(
      flows(model)
        .filter((edge) => natives.has(edge.target))
        .map((edge) => edge.source),
    );
    return { packages, pipelines, natives, sources };
  }
  function computeGraph(model, taskId) {
    const taskNode = model.nodes[taskId];
    const chain = preparationChain(model, taskId);
    const supports = supportsOf(model, taskId);
    const chainNodes = new Set([
      ...chain.sources,
      ...chain.natives,
      ...chain.pipelines,
      ...chain.packages,
    ]);
    const chainEdges = flows(model).filter(
      (edge) =>
        (chain.sources.has(edge.source) && chain.natives.has(edge.target)) ||
        (chain.pipelines.has(edge.source) &&
          (chain.natives.has(edge.target) || chain.packages.has(edge.target))) ||
        (chain.packages.has(edge.source) && edge.target === taskId),
    );
    /* Nodes of one audited chain share a horizontal track, propagated over its links. */
    const trackOf = new Map();
    [...chain.sources].forEach((sourceId, index) => trackOf.set(sourceId, index));
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of chainEdges) {
        if (!chainNodes.has(edge.source) || !chainNodes.has(edge.target)) continue;
        if (trackOf.has(edge.source) && !trackOf.has(edge.target)) {
          trackOf.set(edge.target, trackOf.get(edge.source));
          changed = true;
        } else if (trackOf.has(edge.target) && !trackOf.has(edge.source)) {
          trackOf.set(edge.source, trackOf.get(edge.target));
          changed = true;
        }
      }
    }
    const COLUMN_X = { source: 40, native: 300, pipeline: 560, package: 820, task: 1120 };
    const nodes = [];
    const edges = chainEdges.map((edge) => ({
      kind: 'flow',
      from: edge.source,
      to: edge.target,
    }));
    const trackY = (track) => 110 + track * 250;
    for (const [column, group] of [
      ['source', chain.sources],
      ['native', chain.natives],
      ['pipeline', chain.pipelines],
      ['package', chain.packages],
    ]) {
      for (const id of group) {
        const data = model.nodes[id].data;
        const track = trackOf.get(id) ?? 0;
        nodes.push({
          id,
          type: model.nodes[id].type,
          x: COLUMN_X[column],
          y: trackY(track),
          w: model.nodes[id].type === 'transformation' ? 230 : 210,
          h: 92,
          name: data.name || id.split(':').slice(0, -1).join(':'),
          sub:
            model.nodes[id].type === 'source_release'
              ? `Record ${id.split(':')[1]}`
              : `Version ${data.version}`,
          status: data.status,
          data,
        });
      }
    }
    /* Every reviewed source keeps its reported support for this task. */
    supports
      .filter((edge) => !chain.sources.has(edge.source))
      .forEach((edge, index) => {
        const id = edge.source;
        nodes.push({
          id,
          type: 'source_release',
          x: COLUMN_X.source,
          y: 560 + index * 66,
          w: 210,
          h: 52,
          name: model.nodes[id].data.name || id.split(':').slice(0, -1).join(':'),
          sub: `Record ${id.split(':')[1]}`,
          status: edge.data.status,
          dim: true,
          data: model.nodes[id].data,
        });
        edges.push({ kind: 'support', from: id, to: taskId, status: edge.data.status });
      });
    nodes.push({
      id: taskId,
      type: 'task',
      x: COLUMN_X.task,
      y: 180,
      w: 230,
      h: 108,
      name: taskNode.data.name,
      sub: taskNode.data.status.replaceAll('_', ' '),
      status: taskNode.data.status,
      data: taskNode.data,
    });
    (taskNode.data.requirements?.variables || []).forEach((variable, index) => {
      nodes.push({
        id: `variable:${variable.key}`,
        type: 'variable',
        x: COLUMN_X.task,
        y: 400 + index * 100,
        w: 230,
        h: 78,
        name: variable.label,
        sub: `${variable.purpose}${variable.quantity ? ' · ' + variable.quantity : ''}`,
        data: variable,
      });
      edges.push({ kind: 'requires', from: taskId, to: `variable:${variable.key}` });
    });
    const maxY = Math.max(...nodes.map((node) => node.y + node.h));
    return {
      nodes,
      edges,
      supports,
      task: taskNode,
      viewBox: `0 0 1380 ${Math.max(940, maxY + 60)}`,
    };
  }
  const byId = (graph, id) => graph.nodes.find((node) => node.id === id);
  function edgePath(graph, edge) {
    const from = byId(graph, edge.from),
      to = byId(graph, edge.to);
    const start = [from.x + from.w, from.y + from.h / 2];
    const end = [to.x, to.y + to.h / 2];
    const control = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2 + (edge.kind === 'support' ? 30 : 0),
    ];
    return `M ${start.join(' ')} Q ${control.join(' ')} ${end.join(' ')}`;
  }
  function renderGraph() {
    const svg = $('#model-graph');
    const graph = computeGraph(state.model, `task:${state.task}`);
    const edgeHtml = graph.edges
      .map((edge) => {
        const color =
          edge.kind === 'support'
            ? SUPPORT_COLORS[edge.status] || '#a4ac9c'
            : edge.kind === 'requires'
              ? '#cca84d'
              : '#3d7a6b';
        const dashes = edge.kind === 'flow' ? '' : '6 5';
        return `<g class="edge-group" data-edge="${esc(edge.from)}=>${esc(edge.to)}" tabindex="0" role="button" aria-label="Connection from ${esc(edge.from)} to ${esc(edge.to)}"><path class="edge-hit" d="${edgePath(graph, edge)}"/><path class="edge ${state.selected === `${edge.from}=>${edge.to}` ? 'selected' : ''}" d="${edgePath(graph, edge)}" stroke="${color}" stroke-dasharray="${dashes}" marker-end="url(#model-arrow)" opacity="${edge.kind === 'support' ? 0.5 : 0.85}"/></g>`;
      })
      .join('');
    const nodeHtml = graph.nodes
      .map((node) => {
        const selected = state.selected === node.id;
        const mark =
          node.type === 'task'
            ? '◈'
            : node.type === 'variable'
              ? '…'
              : node.type === 'transformation'
                ? '⟿'
                : node.type === 'data_contract'
                  ? '▤'
                  : '⌁';
        return `<g class="graph-node ${node.dim ? 'dim' : ''} ${selected ? 'selected' : ''}" data-node="${esc(node.id)}" tabindex="0" role="button" aria-label="${esc(`${node.name}: ${node.sub}`)}" transform="translate(${node.x} ${node.y})"><rect width="${node.w}" height="${node.h}" rx="12"/><text class="node-mark" x="14" y="28">${mark}</text><text class="node-name" x="38" y="27">${esc(node.name)}</text><text class="node-sub" x="15" y="${node.h - 30}">${esc(node.sub)}</text>${node.status ? `<text class="node-status" x="15" y="${node.h - 12}">${esc(String(node.status).replaceAll('_', ' ').toUpperCase())}</text>` : ''}</g>`;
      })
      .join('');
    svg.setAttribute('viewBox', graph.viewBox);
    svg.innerHTML = `<defs><marker id="model-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#5a7a6c"/></marker></defs>${edgeHtml}${nodeHtml}`;
    const flowLinks = graph.edges.filter((edge) => edge.kind === 'flow').length;
    $('#model-graph-count').textContent =
      `${graph.nodes.filter((node) => node.type === 'source_release').length} sources · ` +
      `${flowLinks} audited flow links · ${graph.supports.length} reported support links`;
    $('#model-graph-title').textContent = `${graph.task.data.name} — data model`;
    renderInspector(graph);
  }
  function fieldTable(fields) {
    if (!fields?.length) return '';
    const rows = fields
      .map(
        (field) =>
          `<tr><td><code>${esc(field.name)}</code>${field.required ? ' <span class="badge">required</span>' : ''}</td><td>${esc((field.dtypes || []).join(' / '))}</td><td>${esc(Array.isArray(field.shape) ? field.shape.join(' × ') : field.shape || '')}</td><td>${esc(field.meaning || '')}</td></tr>`,
      )
      .join('');
    return `<div class="scroll-table"><table><caption>Fields of the shared data contract</caption><thead><tr><th>Field</th><th>Type</th><th>Shape</th><th>Meaning</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function renderInspector(graph) {
    const box = $('#model-inspector');
    if (!state.selected) {
      box.innerHTML = `<div class="inspector-top">MODEL OVERVIEW</div><h3>${esc(graph.task.data.title || graph.task.data.name)}</h3><p>${esc(graph.task.data.description)}</p><p class="notice">Choose a node or a connection. Solid links are audited preparation flow; dashed links are reported support only.</p>`;
      return;
    }
    const node = graph.nodes.find((n) => n.id === state.selected);
    if (node) {
      if (node.type === 'data_contract') {
        box.innerHTML = `<div class="inspector-top"><span>DATA CONTRACT</span></div><h3>${esc(node.data.name)}</h3>${node.data.status ? `<p><span class="badge ${node.data.status === 'validated' ? '' : 'neutral'}">${esc(node.data.status)}</span></p>` : ''}<p><strong>${esc(node.data.format)}</strong></p><p>${esc(node.data.observation_unit)}</p>${fieldTable(node.data.fields)}<p class="evidence-tag">The contract defines the shared data model; sample availability does not establish whole-source coverage.</p>`;
      } else if (node.type === 'transformation') {
        box.innerHTML = `<div class="inspector-top"><span>PREPARATION PIPELINE</span></div><h3>${esc(node.data.name)}</h3><p><span class="badge">${esc(node.data.status)}</span></p><h4>Rules</h4><p>${esc(node.data.rules)}</p><h4>Preserves</h4><p>${esc(node.data.preserves)}</p><h4>Limits and information loss</h4><p class="notice">${esc(node.data.losses)}</p><h4>Implementation</h4><p>${esc(node.data.implementation)}</p>`;
      } else if (node.type === 'variable') {
        box.innerHTML = `<div class="inspector-top"><span>TASK VARIABLE</span></div><h3>${esc(node.data.label)}</h3><p><span class="badge">${esc(node.data.purpose)}</span>${node.data.quantity ? ` <span class="badge neutral">${esc(node.data.quantity)}</span>` : ''}</p><p>${esc(node.data.detail)}</p>`;
      } else if (node.type === 'task') {
        const uses = Object.entries(node.data.requirements?.uses || {})
          .map(
            ([, use]) =>
              `<div class="task-mini"><span>${esc(use.label)}</span><span class="task-state">${esc((use.allowed_partitions || []).join(' / '))}</span></div>`,
          )
          .join('');
        box.innerHTML = `<div class="inspector-top"><span>TASK</span></div><h3>${esc(node.data.title || node.data.name)}</h3><p>${esc(node.data.description)}</p><h4>Intended uses</h4>${uses}<p class="notice">Uses keep only the published partitions permitted by your request.</p>`;
      } else {
        const support = graph.supports.find((edge) => edge.source === node.id);
        box.innerHTML = `<div class="inspector-top"><span>SOURCE RELEASE</span><span class="record-number">${esc(node.id.split(':')[1] || '')}</span></div><h3>${esc(node.name)}</h3>${support ? `<p><span class="badge ${support.data.status === 'documented' ? '' : 'neutral'}">${esc(support.data.status.replaceAll('_', ' '))}</span></p><p>${esc(support.data.reason)}</p>` : ''}${node.dim ? '<p class="evidence-tag">Reported support only; no admitted preparation pipeline for this task.</p>' : ''}`;
      }
      return;
    }
    const [from, to] = state.selected.split('=>');
    const support = graph.supports.find((edge) => edge.source === from && edge.target === to);
    box.innerHTML = support
      ? `<div class="inspector-top"><span>REPORTED SUPPORT</span></div><h3>${esc(support.source)} → ${esc(support.target)}</h3><p><span class="badge ${support.data.status === 'documented' ? '' : 'neutral'}">${esc(support.data.status.replaceAll('_', ' '))}</span></p><p>${esc(support.data.reason)}</p><p class="evidence-tag">A reported reference does not admit a preparation pipeline.</p>`
      : `<div class="inspector-top"><span>AUDITED FLOW</span></div><h3>${esc(from)} → ${esc(to)}</h3><p class="evidence-tag">This link is part of an admitted, independently validated preparation flow.</p>`;
  }
  function renderTaskNav() {
    const tasks = Object.entries(state.model.nodes)
      .filter(([, node]) => node.type === 'task')
      .sort((a, b) => (a[1].data.order ?? 99) - (b[1].data.order ?? 99));
    $('#model-task-nav').innerHTML = tasks
      .map(
        ([id, node]) =>
          `<button class="task-option-model ${id === `task:${state.task}` ? 'active' : ''}" data-task="${esc(id.split(':')[1])}" role="tab" aria-selected="${id === `task:${state.task}`}">${esc(node.data.name)}<span class="task-state ${node.data.status === 'work_in_progress' ? 'yes' : ''}">${esc(node.data.status.replaceAll('_', ' '))}</span></button>`,
      )
      .join('');
  }
  function render() {
    renderTaskNav();
    renderGraph();
  }
  async function ensureModel() {
    if (state.model) return;
    const model = await load();
    state.model = model;
    $('#model-status').textContent = 'Reviewed knowledge model';
    $('#model-status').className = 'badge';
    render();
  }
  doc.addEventListener('click', (event) => {
    const taskButton = event.target.closest('[data-task]');
    if (taskButton) {
      state.task = taskButton.dataset.task;
      state.selected = null;
      render();
      return;
    }
    const nodeGroup = event.target.closest('#model-graph [data-node]');
    if (nodeGroup) {
      state.selected = nodeGroup.dataset.node;
      renderGraph();
      return;
    }
    const edgeGroup = event.target.closest('#model-graph [data-edge]');
    if (edgeGroup) {
      state.selected = edgeGroup.dataset.edge;
      renderGraph();
      return;
    }
    if (event.target.closest('#model-graph') && state.selected !== null) {
      state.selected = null;
      renderGraph();
    }
  });
  return {
    open() {
      ensureModel().catch((error) => {
        $('#model-status').textContent = 'Knowledge model unavailable';
        $('#model-status').className = 'badge red';
        $('#model-inspector').textContent = error.message;
      });
    },
  };
}

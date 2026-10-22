/* Presentation projections preserve canonical identities and relationship roles. */
export function visibleTasks(model) {
  return Object.entries(model.nodes)
    .filter(([, node]) => node.type === 'task' && node.data.visible)
    .sort((a, b) => a[1].data.order - b[1].data.order);
}

export function projectTaskGraph(model, taskId, { includeReported = false } = {}) {
  const task = model.nodes[taskId];
  if (task?.type !== 'task' || !task.data.visible) throw Error('Task model is unavailable');
  const nodes = new Map();
  const edges = new Map();
  const hierarchy = [];
  const addNode = (id) => {
    if (!nodes.has(id)) {
      const node = model.nodes[id];
      if (!node) throw Error(`Missing model node: ${id}`);
      nodes.set(id, {
        id,
        type: node.type,
        name: node.type === 'source_release' ? node.data.profile.name : node.data.name,
        sub:
          node.type === 'source_release'
            ? `Record ${node.data.record_id}`
            : node.data.version
              ? `Version ${node.data.version}`
              : '',
        status: node.data.status,
        data: node.data,
      });
    }
    return nodes.get(id);
  };
  addNode(taskId);
  const supports = Object.entries(model.edges)
    .filter(([, edge]) => edge.type === 'task_support' && edge.target === taskId)
    .map(([id, edge]) => ({ id, ...edge, kind: 'support', role: 'reported_support' }));
  const pipelines = Object.entries(model.nodes).filter(
    ([, node]) =>
      node.type === 'pipeline_spec' && node.data.task_ref === taskId && node.data.execution_enabled,
  );
  const auditedSources = new Set();
  for (const [, pipeline] of pipelines) {
    const p = pipeline.data;
    auditedSources.add(p.source_ref);
    for (const id of [p.source_ref, p.input_ref, p.output_ref, ...p.transformation_refs])
      addNode(id);
    const transformations = new Set(p.transformation_refs);
    for (const [id, edge] of Object.entries(model.edges)) {
      if (edge.type !== 'data_flow') continue;
      const sourceInput =
        edge.role === 'describes' && edge.source === p.source_ref && edge.target === p.input_ref;
      const taskOutput =
        edge.role === 'designed_for' && edge.source === p.output_ref && edge.target === taskId;
      const operation =
        transformations.has(edge.source) && ['consumes', 'produces'].includes(edge.role);
      if (!sourceInput && !taskOutput && !operation) continue;
      addNode(edge.source);
      addNode(edge.target);
      edges.set(id, { id, ...edge, kind: 'flow' });
    }
  }
  for (const edge of edges.values()) {
    const forward = edge.role === 'consumes';
    hierarchy.push({
      parent: forward ? edge.source : edge.target,
      child: forward ? edge.target : edge.source,
      distance: edge.role === 'designed_for' ? 2 : 1,
    });
  }
  for (const variable of task.data.requirements?.variables || []) {
    const id = `${taskId}:variable:${variable.key}`;
    nodes.set(id, {
      id,
      type: 'variable',
      name: variable.label,
      sub: variable.purpose,
      data: variable,
    });
    const edgeId = `${taskId}:requires:${variable.key}`;
    edges.set(edgeId, {
      id: edgeId,
      source: taskId,
      target: id,
      kind: 'requires',
      role: 'requires',
    });
    hierarchy.push({ parent: taskId, child: id, distance: 1 });
  }
  const reported = supports.filter((edge) => !auditedSources.has(edge.source));
  if (includeReported) {
    for (const edge of reported) {
      const node = addNode(edge.source);
      node.reported = true;
      node.status = edge.data.status;
      edges.set(edge.id, edge);
    }
  }
  return {
    taskId,
    task,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    hierarchy,
    supports,
    pipelineCount: pipelines.length,
    reportedCount: reported.length,
    sourceCount: new Set([...auditedSources, ...supports.map((edge) => edge.source)]).size,
  };
}

/* Measure titles in the browser; deterministic estimates keep layout testable offline. */
export function wrapLabel(text, width, measure = (value) => value.length * 7, maxLines = 3) {
  const lines = [];
  let remaining = String(text || '');
  while (remaining && lines.length < maxLines) {
    let end = remaining.length;
    while (end > 1 && measure(remaining.slice(0, end)) > width) end--;
    if (end < remaining.length) {
      const space = remaining.lastIndexOf(' ', end);
      if (space > 0) end = space;
    }
    let line = remaining.slice(0, end).trim();
    remaining = remaining.slice(end).trim();
    if (remaining && lines.length === maxLines - 1) {
      while (line && measure(`${line}…`) > width) line = line.slice(0, -1);
      line += '…';
    }
    lines.push(line);
  }
  return lines;
}

export function layoutTaskGraph(graph, measure) {
  const ranks = new Map([[graph.taskId, 0]]);
  for (let pass = 0; pass <= graph.nodes.length; pass++) {
    let changed = false;
    for (const { parent, child, distance } of graph.hierarchy) {
      if (!ranks.has(parent)) continue;
      const rank = ranks.get(parent) + distance;
      if ((ranks.get(child) ?? -1) < rank) {
        ranks.set(child, rank);
        changed = true;
      }
    }
    if (!changed) break;
    if (pass === graph.nodes.length) throw Error('Preparation hierarchy contains a cycle');
  }
  const width = 252,
    gap = 32;
  const nodes = graph.nodes.map((node) => {
    const lines = wrapLabel(node.name, width - 28, measure);
    const meta = [node.sub, node.status?.replaceAll('_', ' ')].filter(Boolean).join(' · ');
    const metaLines = wrapLabel(
      meta,
      width - 28,
      (text) => measure?.(text, 10) ?? text.length * 5,
      2,
    );
    return {
      ...node,
      lines,
      metaLines,
      w: width,
      h: Math.max(100, 46 + lines.length * 17 + metaLines.length * 14),
    };
  });
  const rows = new Map();
  for (const node of nodes.filter((node) => !node.reported)) {
    const rank = ranks.get(node.id);
    if (rank === undefined) throw Error(`Disconnected preparation node: ${node.id}`);
    if (!rows.has(rank)) rows.set(rank, []);
    rows.get(rank).push(node);
  }
  const graphWidth = Math.max(...[...rows.values()].map((row) => row.length * (width + gap) - gap));
  let y = 24;
  for (const [, row] of [...rows].sort(([a], [b]) => a - b)) {
    row.forEach((node, column) => {
      node.x = (graphWidth - (row.length * (width + gap) - gap)) / 2 + column * (width + gap);
      node.y = y;
    });
    y += Math.max(...row.map((node) => node.h)) + gap;
  }
  const reported = nodes.filter((node) => node.reported);
  const reportedTop = y + 24;
  let reportedBottom = y;
  for (let index = 0; index < reported.length; index += 2) {
    const row = reported.slice(index, index + 2);
    row.forEach((node, column) => {
      node.x = (graphWidth - (2 * (width + gap) - gap)) / 2 + column * (width + gap);
      node.y = reportedBottom + 72;
    });
    reportedBottom += 72 + Math.max(...row.map((node) => node.h));
  }
  const minX = Math.min(...nodes.map((node) => node.x)) - (reported.length ? 80 : 40);
  return {
    ...graph,
    nodes,
    reportedTop,
    bounds: {
      x: minX,
      y: 0,
      width: Math.max(...nodes.map((node) => node.x + node.w)) + 40 - minX,
      height: Math.max(...nodes.map((node) => node.y + node.h)) + 24,
    },
  };
}

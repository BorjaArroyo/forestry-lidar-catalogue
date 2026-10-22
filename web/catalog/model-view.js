import { escapeHTML as esc } from '../shared/dom.js';
import { layoutTaskGraph, projectTaskGraph, visibleTasks } from './model-graph.js';

const TYPES = {
  task: 'Task',
  variable: 'Task variable',
  source_release: 'Source release',
  data_contract: 'Data contract',
  transformation: 'Preparation step',
};
const ROLES = {
  describes: 'Source describes native data',
  consumes: 'Preparation consumes input contract',
  produces: 'Preparation produces output contract',
  designed_for: 'Prepared contract is designed for the task',
  requires: 'Task requirement',
  reported_support: 'Reported task support',
};

export function mountModelView({ document: doc = document, fetch: doFetch = fetch } = {}) {
  const $ = (selector) => doc.querySelector(selector);
  const svg = $('#model-graph');
  const inspector = $('#model-inspector');
  const state = {
    model: null,
    loading: null,
    graph: null,
    task: null,
    selected: null,
    zoom: 1,
    x: 0,
    y: 0,
  };
  const context = doc.createElement('canvas').getContext('2d');
  const measure = (text, size = 14) => {
    context.font = `${size === 14 ? 600 : 400} ${size}px ${doc.defaultView.getComputedStyle(svg).fontFamily}`;
    return context.measureText(text).width;
  };
  function transform() {
    $('#model-content')?.setAttribute(
      'transform',
      `translate(${state.x} ${state.y}) scale(${state.zoom})`,
    );
  }
  function fitGraph() {
    const rect = svg.getBoundingClientRect();
    if (!state.graph || !rect.width || !rect.height) return;
    const bounds = state.graph.bounds,
      margin = 20;
    state.zoom = Math.min(
      1,
      (rect.width - margin * 2) / bounds.width,
      (rect.height - margin * 2) / bounds.height,
    );
    state.x = (rect.width - bounds.width * state.zoom) / 2 - bounds.x * state.zoom;
    state.y = (rect.height - bounds.height * state.zoom) / 2 - bounds.y * state.zoom;
    transform();
  }
  function zoomBy(factor, cx = svg.clientWidth / 2, cy = svg.clientHeight / 2) {
    const zoom = Math.min(3, Math.max(0.08, state.zoom * factor));
    state.x = cx - ((cx - state.x) * zoom) / state.zoom;
    state.y = cy - ((cy - state.y) * zoom) / state.zoom;
    state.zoom = zoom;
    transform();
  }
  function edgePath(edge) {
    const from = state.graph.nodes.find((node) => node.id === edge.source);
    const to = state.graph.nodes.find((node) => node.id === edge.target);
    if (edge.kind === 'support') {
      const lane = state.graph.bounds.x + 16;
      return `M ${from.x + from.w / 2} ${from.y + from.h} v 16 H ${lane} V ${to.y + to.h / 2} H ${to.x}`;
    }
    if (edge.role === 'designed_for') {
      const left = from.x < to.x;
      const lane = left
        ? state.graph.bounds.x + 24
        : state.graph.bounds.x + state.graph.bounds.width - 16;
      return `M ${from.x + from.w / 2} ${from.y} v -16 H ${lane} V ${to.y + to.h / 2} H ${left ? to.x : to.x + to.w}`;
    }
    const downward = from.y < to.y;
    const start = [from.x + from.w / 2, downward ? from.y + from.h : from.y];
    const end = [to.x + to.w / 2, downward ? to.y : to.y + to.h];
    const middle = (start[1] + end[1]) / 2;
    return `M ${start.join(' ')} C ${start[0]} ${middle} ${end[0]} ${middle} ${end.join(' ')}`;
  }
  function fieldTable(fields) {
    if (!fields?.length) return '';
    return `<div class="scroll-table"><table><caption>Fields of this data contract</caption><thead><tr><th>Field</th><th>Type</th><th>Shape</th><th>Meaning</th></tr></thead><tbody>${fields.map((field) => `<tr><td><code>${esc(field.name)}</code>${field.required ? ' (required)' : ''}</td><td>${esc((field.dtypes || []).join(' / '))}</td><td>${esc(Array.isArray(field.shape) ? field.shape.join(' × ') : field.shape)}</td><td>${esc(field.meaning)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderInspector() {
    const graph = state.graph;
    const node = graph.nodes.find((item) => item.id === state.selected);
    const edge = graph.edges.find((item) => item.id === state.selected);
    if (!node && !edge) {
      inspector.innerHTML = `<div class="inspector-top">MODEL OVERVIEW</div><h3>${esc(graph.task.data.title)}</h3><p>${esc(graph.task.data.description)}</p><p>${graph.pipelineCount ? `${graph.pipelineCount} admitted preparation routes are shown.` : 'No admitted preparation route is available for this task.'}</p><p class="notice">Choose a node or a connection to inspect its meaning and evidence. The arrows preserve each relationship's direction.</p>`;
    } else if (edge) {
      const names = [edge.source, edge.target].map(
        (id) => graph.nodes.find((item) => item.id === id).name,
      );
      inspector.innerHTML = `<div class="inspector-top">${esc(edge.kind === 'flow' ? 'PREPARATION RELATIONSHIP' : edge.kind === 'requires' ? 'TASK REQUIREMENT' : 'REPORTED SUPPORT')}</div><h3>${esc(ROLES[edge.role])}</h3><p>${names.map(esc).join(' → ')}</p>${edge.kind === 'requires' ? '<p>This task variable describes an input requirement. It is not a preparation or evidence of source coverage.</p>' : edge.kind === 'support' ? `<p>${esc(edge.data.reason)}</p><p class="notice">Reported support does not admit an executable preparation.</p>` : '<p>This relationship belongs to an enabled, validated source-specific preparation route.</p>'}<code class="raw-path">${esc(edge.id)}</code>`;
    } else {
      const data = node.data;
      let detail = '';
      if (node.type === 'data_contract') {
        detail = `<p><strong>${esc(data.format)}</strong></p><p>${esc(data.observation_unit)}</p>${fieldTable(data.fields)}<p class="notice">A contract describes fields; it does not certify annotation completeness or whole-source coverage.</p>`;
      } else if (node.type === 'transformation') {
        detail = `<h4>Rules</h4><p>${esc(data.rules)}</p><h4>Preserves</h4><p>${esc(data.preserves)}</p><h4>Limits and information loss</h4><p class="notice">${esc(data.losses)}</p><h4>Implementation</h4><p>${esc(data.implementation)}</p>`;
      } else if (node.type === 'variable') {
        detail = `<p>${esc(data.detail)}</p>${fieldTable(data.output_fields)}`;
      } else if (node.type === 'task') {
        detail = `<p>${esc(data.description)}</p><h4>Intended uses</h4>${Object.values(
          data.requirements?.uses || {},
        )
          .map((use) => `<h4>${esc(use.label)}</h4><p>${esc(use.detail)}</p>`)
          .join('')}`;
      } else {
        const support = graph.supports.find((item) => item.source === node.id);
        detail = `<p>${esc(data.profile.geography)}</p><p>${esc(data.profile.discovery.coverage)}</p>${support ? `<h4>Reported task support</h4><p>${esc(support.data.reason)}</p>` : ''}${node.reported ? '<p class="notice">No admitted preparation route is registered for this source and task.</p>' : `<h4>Audited preparation scope</h4><p>${esc(data.profile.discovery.preparation.detail)}</p>`}`;
      }
      inspector.innerHTML = `<div class="inspector-top">${esc(TYPES[node.type])}</div><h3>${esc(node.name)}</h3>${node.status ? `<p class="model-state">${esc(node.status.replaceAll('_', ' '))}</p>` : ''}${detail}<code class="raw-path">${esc(node.id)}</code>`;
    }
  }
  function select(id) {
    state.selected = id;
    svg.querySelectorAll('[data-node], [data-edge]').forEach((element) => {
      const selected = (element.dataset.node || element.dataset.edge) === id;
      element.classList.toggle('selected', selected);
      element.setAttribute('aria-pressed', String(selected));
    });
    renderInspector();
  }
  function renderGraph() {
    state.graph = layoutTaskGraph(
      projectTaskGraph(state.model, state.task, {
        includeReported: $('#model-show-reported').checked,
      }),
      measure,
    );
    const graph = state.graph;
    const edgeHtml = graph.edges
      .map(
        (edge) =>
          `<g class="model-edge ${edge.kind}" data-edge="${esc(edge.id)}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(ROLES[edge.role])}: ${esc(graph.nodes.find((node) => node.id === edge.source).name)} to ${esc(graph.nodes.find((node) => node.id === edge.target).name)}"><title>${esc(ROLES[edge.role])}</title><path class="edge-hit" d="${edgePath(edge)}"/><path class="edge" d="${edgePath(edge)}" marker-end="url(#model-arrow)"/></g>`,
      )
      .join('');
    const nodesHtml = graph.nodes
      .map(
        (node) =>
          `<g class="graph-node ${node.reported ? 'reported' : ''}" data-node="${esc(node.id)}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(`${node.name}. ${node.sub}`)}" transform="translate(${node.x} ${node.y})"><title>${esc(node.name)}</title><rect width="${node.w}" height="${node.h}" rx="10"/><text class="node-type" x="14" y="19">${esc(TYPES[node.type].toUpperCase())}</text><text class="node-name">${node.lines.map((line, index) => `<tspan x="14" y="${40 + index * 17}">${esc(line)}</tspan>`).join('')}</text><text class="node-sub">${node.metaLines.map((line, index) => `<tspan x="14" y="${node.h - 16 - (node.metaLines.length - 1 - index) * 14}">${esc(line)}</tspan>`).join('')}</text></g>`,
      )
      .join('');
    const groupLabel = graph.nodes.some((node) => node.reported)
      ? `<text class="model-group-label" x="${graph.bounds.x + 64}" y="${graph.reportedTop}">REPORTED SUPPORT · NO ADMITTED PREPARATION</text>`
      : '';
    svg.innerHTML = `<defs><marker id="model-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs><g id="model-content">${edgeHtml}${groupLabel}${nodesHtml}</g>`;
    $('#model-graph-count').textContent =
      `${graph.nodes.filter((node) => node.type === 'source_release').length} of ${graph.sourceCount} sources · ${graph.pipelineCount} admitted routes`;
    $('#model-reported-count').textContent = String(graph.reportedCount);
    $('#model-graph-title').textContent = graph.task.data.title;
    $('#model-empty').hidden = graph.pipelineCount > 0;
    select(null);
    fitGraph();
  }
  function render() {
    const tasks = visibleTasks(state.model);
    $('#model-task-nav').hidden = tasks.length < 2;
    $('#model-task-nav').innerHTML = tasks
      .map(
        ([id, node]) =>
          `<button class="task-option-model" data-model-task="${esc(id)}" aria-pressed="${id === state.task}">${esc(node.data.name)}</button>`,
      )
      .join('');
    renderGraph();
  }
  let pointer = null,
    dragged = false;
  svg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: state.x,
      panY: state.y,
    };
    dragged = false;
  });
  svg.addEventListener('pointermove', (event) => {
    if (!pointer) return;
    const dx = event.clientX - pointer.x,
      dy = event.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 5) {
      dragged = true;
      svg.setPointerCapture(pointer.id);
    }
    if (!dragged) return;
    state.x = pointer.panX + dx;
    state.y = pointer.panY + dy;
    transform();
  });
  const release = () => {
    pointer = null;
  };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  svg.addEventListener('lostpointercapture', release);
  svg.addEventListener('click', (event) => {
    if (dragged) {
      dragged = false;
      return;
    }
    const target = event.target.closest('[data-node], [data-edge]');
    select(target?.dataset.node || target?.dataset.edge || null);
  });
  svg.addEventListener('keydown', (event) => {
    const target = event.target.closest('[data-node], [data-edge]');
    if (['Enter', ' '].includes(event.key) && target) {
      event.preventDefault();
      select(target.dataset.node || target.dataset.edge);
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      state.x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0;
      state.y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0;
      transform();
    } else if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      zoomBy(event.key === '-' ? 0.8 : 1.25);
    } else if (event.key === 'Escape') select(null);
    else if (event.key === '0') fitGraph();
  });
  svg.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomBy(
        event.deltaY < 0 ? 1.12 : 1 / 1.12,
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    },
    { passive: false },
  );
  $('#model-zoom-in').addEventListener('click', () => zoomBy(1.25));
  $('#model-zoom-out').addEventListener('click', () => zoomBy(0.8));
  $('#model-zoom-fit').addEventListener('click', fitGraph);
  $('#model-show-reported').addEventListener('change', renderGraph);
  $('#model-task-nav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-model-task]');
    if (button) {
      state.task = button.dataset.modelTask;
      document.dispatchEvent(
        new CustomEvent('canopy-select-task', { detail: { task_ref: state.task } }),
      );
      render();
    }
  });
  const observer = new doc.defaultView.ResizeObserver(() => fitGraph());
  observer.observe(svg);
  async function open() {
    try {
      if (!state.model) {
        state.loading ||= doFetch('data/knowledge-model.json', { cache: 'no-store' }).then(
          (response) => {
            if (!response.ok) throw Error(`Knowledge model HTTP ${response.status}`);
            return response.json();
          },
        );
        const model = await state.loading;
        if (!visibleTasks(model).length) throw Error('No visible task model is available');
        state.model = model;
        state.task = $('#preparation-task')?.value || visibleTasks(model)[0][0];
      }
      $('#model-status').textContent = 'Reviewed knowledge model';
      $('#model-status').className = 'badge';
      $('#model-retry').hidden = true;
      $('#model-show-reported').disabled = false;
      render();
    } catch (error) {
      state.loading = null;
      state.model = null;
      state.graph = null;
      svg.replaceChildren();
      $('#model-status').textContent = 'Knowledge model unavailable';
      $('#model-status').className = 'badge red';
      $('#model-retry').hidden = false;
      $('#model-show-reported').disabled = true;
      $('#model-graph-count').textContent = '';
      inspector.textContent = error.message;
    }
  }
  document.addEventListener('canopy-task-change', (e) => {
    if (state.model) {
      state.task = e.detail.task_ref;
      render();
    }
  });
  $('#model-retry').addEventListener('click', open);
  return { open };
}

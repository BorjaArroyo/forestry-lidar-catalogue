import { escapeHTML as esc, downloadJSON } from '../shared/dom.js';
/* A dependency-free, offline viewer. This application never modifies LiDAR files. */
import { createTaskSelection } from './task-selection.js?v=multitask-v1';
import { parseWorkspaceRoute, workspaceHash } from '../workspace.js?v=multitask-v1';
import {
  normalizeExperiment,
  experimentFromUrl,
  experimentToUrl,
  jointSources,
  referenceFor,
} from '../experiment.js?v=multitask-v1';

export function mountCatalog({
  catalog,
  document: doc = document,
  selection = createTaskSelection(catalog),
}) {
  const data = catalog;
  if (!data) {
    doc.querySelector('main').textContent =
      'Catalog unavailable. Rebuild catalog.js using the documented command.';
    return null;
  }
  let task = selection.task;
  const taskStates = new Map();
  const $ = (selector, root = doc) => root.querySelector(selector);
  const $$ = (selector, root = doc) => [...root.querySelectorAll(selector)];
  const number = (n) => Number(n).toLocaleString('en-US');
  const compact = (n) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : number(n);
  const byId = Object.fromEntries(data.datasets.map((d) => [d.id, d]));
  const state = {
    view: 'datasets',
    section: 'objectives',
    search: '',
    platform: 'all',
    unit: 'all',
    reference: 'all',
    preparation: 'all',
    taskUse: 'training',
    taskVariables: {},
    rank: 'species',
    taskRunning: false,
    compare: new Set(),
  };
  const storageKey = 'canopy-workspace-v1';
  let saved = {};
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (value?.schema_version === '1.0.0') saved = value;
  } catch {
    state.storageUnavailable = true;
  }
  let experiment = normalizeExperiment(saved.experiment, data, saved.activeTask || task.id);
  const joint = () => experiment.tasks.length > 1;
  for (const [id, value] of Object.entries(saved.tasks || {})) {
    const definition = data.tasks.find((entry) => entry.id === id && entry.requirements);
    if (!definition || !value || typeof value !== 'object') continue;
    const variables = Object.fromEntries(
      Object.entries(value.taskVariables || {}).filter(
        ([key, choice]) =>
          definition.requirements.variables.some((entry) => entry.key === key) &&
          ['required', 'optional', 'off'].includes(choice),
      ),
    );
    taskStates.set(id, {
      taskUse: Object.hasOwn(definition.requirements.uses, value.taskUse)
        ? value.taskUse
        : 'training',
      taskVariables: variables,
      rank: value.rank === 'genus' ? 'genus' : 'species',
    });
  }
  function persist() {
    taskStates.set(task.id, {
      taskUse: state.taskUse,
      taskVariables: state.taskVariables,
      rank: state.rank,
    });
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          schema_version: '1.0.0',
          activeTask: task.id,
          tasks: Object.fromEntries(taskStates),
          experiment,
        }),
      );
    } catch {
      state.storageUnavailable = true;
    }
  }
  let serviceConnected = false;
  const discovery = (d) =>
    d.discovery || {
      unit: 'unknown',
      unit_label: 'Unit not reviewed',
      instance_reference: { status: 'unknown', label: 'Reference not reviewed' },
      coverage: 'Annotation coverage is not established.',
      limitation: d.correction,
      preparation: {
        status: 'tbd',
        label: 'Task pipeline TBD',
        detail: 'No audited task preparation is registered.',
      },
    };
  function updateAvailability() {
    const available = data.datasets.filter(
      (dataset) => discovery(dataset).preparation.status === 'ready',
    );
    const names = available.map((dataset) => dataset.name);
    const prepared = names.length
      ? `${names.join(' and ')} ${names.length === 1 ? 'has' : 'have'} an admitted preparation for its reviewed scope.`
      : 'No source currently has an admitted preparation.';
    $('.source-scope').textContent =
      `${prepared} Source preparation does not establish geographic independence or annotation completeness.`;
  }
  const recordSize = (d) =>
    Number.isFinite(d.download_bytes)
      ? d.download_bytes >= 1e9
        ? `${(d.download_bytes / 1e9).toFixed(1)} GB`
        : `${(d.download_bytes / 1e6).toFixed(1)} MB`
      : 'Size not reviewed';
  const readinessHtml = (d) => {
    const s = discovery(d);
    if (joint())
      return `<dl class="source-readiness">${experiment.tasks.map((id) => `<div><dt>${id === 'instances' ? 'Instances' : 'Taxonomy'}</dt><dd>${esc(referenceFor(d, id).label)}</dd></div>`).join('')}<div><dt>Preparation</dt><dd>Joint route unavailable</dd></div></dl>`;
    if (task.id === 'species')
      return `<dl class="source-readiness"><div><dt>Taxonomic reference</dt><dd>${esc(referenceFor(d, 'species').label)}</dd></div><div><dt>Task preparation</dt><dd>${esc(d.classification ? s.preparation.label : 'No admitted classification pipeline')}</dd></div></dl>`;
    return `<dl class="source-readiness"><div><dt>${task.id === 'species' ? 'Taxonomic reference' : 'Instance reference'}</dt><dd><span class="source-status reference-${esc(s.instance_reference.status)}">${esc(s.instance_reference.label)}</span></dd></div><div><dt>Task preparation</dt><dd><span class="source-status preparation-${esc(s.preparation.status)}">${esc(s.preparation.label)}</span></dd></div></dl>`;
  };
  const sourceServiceNote = (source) =>
    source?.classification
      ? 'Classification originals are read from the pinned provider or supplied locally in Review. The optional HTTP service does not prepare this task.'
      : (serviceConnected
          ? 'The connected service can inspect the record before you start its download.'
          : 'Connect the local service to download originals into a chosen directory. The provider record remains directly accessible.') +
        ' This optional service retrieves whole records. Browser plot selection is available for admitted requests.';
  const matches = (d) => {
    const text = [
      d.name,
      d.title,
      d.labels,
      d.scanner,
      d.domain,
      d.geography,
      d.license,
      ...d.source_fields,
    ]
      .join(' ')
      .toLowerCase();
    return (
      (!state.search || text.includes(state.search.toLowerCase())) &&
      (state.platform === 'all' || d.modalities.includes(state.platform)) &&
      (state.unit === 'all' || discovery(d).unit === state.unit) &&
      (state.reference === 'all' || discovery(d).instance_reference.status === state.reference) &&
      (state.preparation === 'all' || discovery(d).preparation.status === state.preparation) &&
      (joint()
        ? jointSources(data).some((source) => source.id === d.id)
        : selection.matches(d.id, taskRequest()))
    );
  };
  const visibleDatasets = () => data.datasets.filter(matches);
  function taskRequest() {
    const variables = { ...state.taskVariables };
    for (const key of task.requirements.uses[state.taskUse].required_variables)
      delete variables[key];
    return {
      ...selection.normalize(state.taskUse, variables),
      ...(task.id === 'species' ? { rank: state.rank } : {}),
    };
  }
  function renderTaskRequest() {
    const request = taskRequest(),
      use = task.requirements.uses[request.use];
    $('#task-use').value = request.use;
    $('#task-rank-label').hidden = joint() || task.id !== 'species';
    $('#task-use').closest('label').hidden = joint();
    $('#experiment-rank-label').hidden = !joint();
    $('#experiment-rank').value = experiment.rank;
    $('#task-rank').value = state.rank;
    $('#task-variables').hidden = task.id === 'species';
    $('#task-use').disabled = state.taskRunning;
    for (const variable of task.requirements.variables) {
      const input = $('#variable-' + variable.key);
      input.value = request.variables[variable.key];
      input.disabled = state.taskRunning || use.required_variables.includes(variable.key);
    }
    $('#task-native-selector').hidden = joint();
    $('#experiment-source-context').hidden = !joint();
    $('#task-request-summary').textContent = joint()
      ? 'Each target keeps its own reference, validity and dimensions. Review shared coverage before execution.'
      : use.detail;
  }
  function omittedVariables(result) {
    return Object.keys(result.omitted).map(
      (key) => task.requirements.variables.find((v) => v.key === key).label,
    );
  }
  function requestFit(d) {
    if (joint())
      return '<div class="request-fit"><strong>Joint preparation is unavailable</strong><p>Reference availability does not establish an admitted joint pipeline.</p></div>';
    const result = selection.assess(d.id, taskRequest());
    const omitted = omittedVariables(result);
    const channels = task.preparation_sources[d.id].native_reflectance;
    return `<div class="request-fit"><strong>${result.status === 'ready' ? 'Audited pipeline matches this request' : 'Preparation for this request is unavailable'}</strong>${omitted.length ? `<p>Not produced: ${esc(omitted.join(', '))}.</p>` : ''}${channels.length ? `<p>${channels.length} native reflectance channels documented (${esc(channels.map((c) => c.wavelength_nm + ' nm').join(', '))}). ${result.included.reflectance ? 'Audited output preserves native measurements and validity masks.' : 'Native availability does not provide an audited spectral output for this request.'} Units and calibration require source-specific review.</p>` : ''}</div>`;
  }
  function taskChanged() {
    renderTaskRequest();
    render();
    updateUrl();
    document.dispatchEvent(new CustomEvent('canopy-task-request', { detail: taskRequest() }));
  }
  document.addEventListener('canopy-set-task-request', (event) => {
    if (state.taskRunning || joint()) return;
    if (event.detail.task_ref && event.detail.task_ref !== 'task:' + task.id) return;
    const normalized = selection.normalize(event.detail.use, event.detail.variables || {});
    state.taskUse = normalized.use;
    state.taskVariables = { ...normalized.variables };
    if (['genus', 'species'].includes(event.detail.rank)) state.rank = event.detail.rank;
    taskChanged();
  });
  function sourceReview(d) {
    const r = d.review;
    if (!r) return '<p>Source review is pending.</p>';
    return `<h4>Observation unit</h4><p>${esc(r.observation_unit)}</p><h4>Reported by the source</h4>${r.source_facts.map((f) => `<p>${esc(f.text)} ${link(f.label, f.url)}</p>`).join('')}<h4>Published protocol</h4><p>${esc(r.published_protocol)}</p><p class="evidence-tag">${r.observations_current ? 'Observation metadata matches the reviewed snapshot.' : 'Metadata changed; these historical observations need rechecking.'}</p><h4>Unresolved before scientific use</h4><ul>${r.open_questions.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p class="evidence-tag">Reviewed ${esc(r.reviewed_at)} · ${esc(r.scope)}</p>`;
  }
  function nativeMeasurements(d) {
    return (d.native_measurement_contracts || [])
      .map((contract) => {
        const channels = Object.fromEntries(contract.channels.map((c) => [c.id, c]));
        const rows = contract.fields
          .filter((f) => f.role === 'measurement')
          .map((field) => {
            const m = field.measurement,
              channel = channels[m.channel_ref];
            const absent =
              m.missingness.status === 'documented_sentinel'
                ? m.missingness.values.join(', ')
                : 'Not documented';
            const association =
              m.association.method === 'nearest_neighbor'
                ? `NN ≤ ${m.association.max_distance_m} m (header reported)`
                : 'Not documented';
            return `<tr><td><code>${esc(field.name)}</code></td><td>${esc(field.dtypes.join(' / '))}</td><td>${esc(channel.scanner_id)} · ${esc(channel.wavelength_nm)} nm</td><td>${esc(absent)}</td><td>${esc(m.unit.symbol ?? 'Unknown')}</td><td>${esc(association)}</td></tr>`;
          })
          .join('');
        const display = contract.fields
          .filter((f) => f.role === 'display')
          .map((f) => f.name)
          .join(', ');
        return `<h4>Multispectral measurements</h4><p>${esc(contract.observation_unit)}</p><p>${contract.channels.map((c) => `${esc(c.scanner_id)}: ${esc(c.sensor_model)} (${esc(c.wavelength_nm)} nm)`).join(' · ')}</p><div class="scroll-table"><table><caption>Native channel fields; absence is interpreted per field.</caption><thead><tr><th>Field</th><th>Stored type</th><th>Scanner · wavelength</th><th>Missing sentinel</th><th>Unit</th><th>Association</th></tr></thead><tbody>${rows}</tbody></table></div><p>Calibration: ${contract.channels.map((c) => `${esc(c.scanner_id)} ${esc(c.calibration.status.replaceAll('_', ' '))}`).join(' · ')}. Association accuracy has not been validated.</p>${display ? `<p class="notice">${esc(display)} are display fields. Source descriptions disagree about intensity versus reflectance; quantity, scaling and absence rules remain unresolved.</p>` : ''}<p>Sample availability is not whole-source coverage. Instance-reference masks are separate from measurement-validity masks. This metadata does not admit a preparation pipeline.</p>`;
      })
      .join('');
  }
  function classSemantics(d) {
    const classes = d.class_semantics;
    if (!classes) return '';
    const rows = classes
      .map((c) => `<tr><td><code>${esc(c.code)}</code></td><td>${esc(c.term)}</td></tr>`)
      .join('');
    return `<h4>Native class codes</h4><div class="scroll-table"><table><caption>Codes are scoped to this source; the same code can mean something different in another source.</caption><thead><tr><th>Code</th><th>Source term</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function safeUrl(url) {
    try {
      const parsed = new URL(url);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : '#';
    } catch {
      return '#';
    }
  }
  function badge(text, type = 'neutral') {
    return `<span class="badge ${esc(type)}">${esc(text)}</span>`;
  }
  function link(label, url) {
    return `<a class="source-link" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
  }
  function toast(text) {
    $('#toast').textContent = text;
    $('#toast').hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($('#toast').hidden = true), 3200);
  }

  function cardHtml(d) {
    const s = discovery(d);
    const upcoming = s.preparation.status !== 'ready';
    const fit = joint()
      ? { status: 'blocked', omitted: {} }
      : selection.assess(d.id, taskRequest());
    const omitted = omittedVariables(fit);
    return `<article class="dataset-card source-card${upcoming ? ' upcoming' : ''}" data-source="${d.id}" aria-labelledby="source-title-${d.id}">
      <header class="source-card-heading"><div><p class="source-kicker">${esc(d.modalities.join(' · '))} <span>· ${esc(s.unit_label)}</span></p><h3 id="source-title-${d.id}">${esc(d.name)}</h3></div><label class="card-compare"><input type="checkbox" data-compare-check="${d.id}" aria-label="Compare ${esc(d.name)}" ${state.compare.has(d.id) ? 'checked' : ''}><span>Compare</span></label></header>
      <p class="source-location">${esc(d.geography)}</p>
      <p class="source-coverage">${esc(s.coverage)}</p>
      ${readinessHtml(d)}
      ${upcoming ? '' : `<div class="card-fit ${fit.status === 'ready' ? 'ok' : 'no'}"><strong>${fit.status === 'ready' ? 'Ready for your request' : 'Current requirements are not covered'}</strong>${omitted.length ? `<p>Not produced: ${esc(omitted.join(', '))}.</p>` : ''}</div>`}
      <div class="source-limitation"><strong>Key limitation</strong><p>${esc(s.limitation)}</p></div>
      <footer class="card-bottom"><p class="card-meta"><strong>${recordSize(d)}</strong><span>${d.assets} ${d.assets === 1 ? 'asset' : 'assets'} · whole pinned record</span></p><div class="card-actions"><button class="button small ${fit.status === 'ready' ? '' : 'primary'}" data-detail="${d.id}">View details</button>${joint() ? `<button class="button small" data-experiment-add="${d.id}">Add to experiment</button>` : fit.status === 'ready' ? `<button class="button small primary" data-task-prepare="${d.id}">Prepare <span aria-hidden="true">→</span></button>` : ''}</div></footer>
    </article>`;
  }
  function renderDatasets() {
    const rows = visibleDatasets();
    $('#catalog-count').textContent =
      `${rows.length} of ${data.datasets.length} source records · ${joint() ? 0 : rows.filter((d) => selection.assess(d.id, taskRequest()).status === 'ready').length} with an audited pipeline for this request`;
    if (!rows.length) {
      $('#dataset-grid').innerHTML =
        '<div class="empty">No source matches all these conditions.<button class="button small" data-clear-filters>Clear all filters</button><p>This catalog does not cover every public source.</p></div>';
      return;
    }
    const ready = rows.filter((d) => discovery(d).preparation.status === 'ready');
    const upcoming = rows.filter((d) => discovery(d).preparation.status !== 'ready');
    const divider =
      ready.length && upcoming.length
        ? `<div class="grid-divider"><div><h3>Upcoming sources</h3><p>Reviewed records listed for discovery; no audited preparation is admitted for this task yet.</p></div><span class="muted">${upcoming.length} ${upcoming.length === 1 ? 'source' : 'sources'}</span></div>`
        : '';
    $('#dataset-grid').innerHTML =
      ready.map(cardHtml).join('') + divider + upcoming.map(cardHtml).join('');
  }
  function detail(id) {
    const d = byId[id];
    if (!d) return;
    const s = discovery(d);
    const fit = joint() ? { status: 'blocked' } : selection.assess(id, taskRequest());
    const dialog = $('#detail-dialog');
    const wasOpen = dialog.open;
    const scrollTop = dialog.scrollTop;
    const expanded = $$('#dialog-detail details[open]').map((section) => section.dataset.section);
    state.detailSource = id;
    $('#detail-dialog-title').textContent = d.name;
    $('#dialog-detail').innerHTML = `<div class="source-detail">
      <section class="source-summary" aria-label="Source summary"><div class="badges">${badge(d.modalities.join(' · '))}${badge(s.unit_label)}${badge(`Pinned record ${d.id}`)}</div><p class="source-location">${esc(d.geography)}</p><p class="source-coverage">${esc(s.coverage)}</p><div class="source-limitation"><strong>Key limitation</strong><p>${esc(s.limitation)}</p></div>
      <div class="source-actions">${fit.status === 'ready' ? `<button class="button primary" data-task-prepare="${d.id}">Prepare data for this request</button>` : ''}${link('Open provider record', d.url)}<button class="button small" data-compare="${d.id}">${state.compare.has(id) ? 'Remove from comparison' : 'Add to comparison'}</button><button class="button small" data-source-download="${d.id}" ${serviceConnected && !d.classification ? '' : 'disabled'}>Review original downloads</button></div><p class="source-service-note">${esc(sourceServiceNote())}</p></section>
      <section class="source-section" aria-label="Request compatibility"><h3>Compatibility with your request</h3>${readinessHtml(d)}${requestFit(d)}</section>
      <details class="source-section" data-section="preparation" open><summary>Preparation and validated scope</summary><p>${esc(s.preparation.detail)}</p><p>Whole pinned record: ${recordSize(d)} in ${d.assets} ${d.assets === 1 ? 'asset' : 'assets'}. Supporting files are included where present; extracted data needs additional space.</p></details>
      <details class="source-section" data-section="evidence"><summary>Source evidence and unresolved questions</summary>${sourceReview(d)}</details>
      <details class="source-section" data-section="native"><summary>Native fields, coordinates and declared terms</summary><h4>Source annotations</h4><p>${esc(d.labels)}</p>${classSemantics(d)}<h4>Coordinates</h4><p>${esc(d.coordinate_policy)}</p><p>${(d.coordinate_references || []).map((c) => `${esc(c.value)}: ${c.files} files`).join(' · ') || 'Conversion deferred; no normalized coordinate audit.'}</p><h4>Native field names</h4><p>Names from saved schemas; types, ranges and units are not uniformly audited.</p><div class="field-pills">${d.source_fields.map((f) => `<code>${esc(f)}</code>`).join('') || 'Conversion deferred; inspect source definitions.'}</div>${nativeMeasurements(d)}<h4>Record-declared terms</h4><p>${esc(d.license.toUpperCase())}. Intended-use and component terms still require review.</p><h4>Provider metadata SHA256</h4><code class="raw-path">${esc(d.source_metadata_sha256)}</code></details>
      <details class="source-section" data-section="history"><summary>Historical local observations</summary><p>${esc(d.study_context)}</p><p>${number(d.cloud_count)} normalized files · ${number(d.chunks)} chunks · ${compact(d.points)} stored points. File counts mix plots and derived trees where applicable; they do not count independent sites.</p><ul>${(d.review?.local_observations || []).map((fact) => `<li>${esc(fact)}</li>`).join('')}</ul><p class="evidence-tag">These saved observations describe a historical workspace. The preparation section states the admitted validation scope.</p></details>
    </div>`;
    if (wasOpen) {
      $$('#dialog-detail details').forEach(
        (section) => (section.open = expanded.includes(section.dataset.section)),
      );
    } else dialog.showModal();
    dialog.scrollTop = wasOpen ? scrollTop : 0;
  }
  function toggleCompare(id) {
    if (state.compare.has(id)) state.compare.delete(id);
    else {
      if (state.compare.size === 3) {
        toast('Compare up to three datasets at a time.');
        return;
      }
      state.compare.add(id);
    }
    render();
    if ($('#detail-dialog').open) {
      detail(id);
      $('[data-compare]', $('#detail-dialog')).focus({ preventScroll: true });
    } else $(`[data-compare-check="${id}"]`)?.focus({ preventScroll: true });
  }
  function showCompare() {
    const rows = [...state.compare].map((id) => byId[id]);
    const fields = [
      ['Platform', (d) => d.modalities.join(' · ')],
      ['Data unit', (d) => discovery(d).unit_label],
      ['Instance reference', (d) => discovery(d).instance_reference.label],
      ['Reference coverage', (d) => discovery(d).coverage],
      ['Task preparation', (d) => discovery(d).preparation.label],
      [
        'Current request',
        (d) =>
          selection.assess(d.id, taskRequest()).status === 'ready'
            ? 'Audited pipeline matches'
            : 'Blocked / TBD',
      ],
      [
        'Variables produced for this request',
        (d) =>
          Object.keys(selection.assess(d.id, taskRequest()).included).join(', ') || 'None admitted',
      ],
      ['Main limitation', (d) => discovery(d).limitation],
      ['Whole record assets', (d) => `${recordSize(d)} · ${d.assets} assets; task subset TBD`],
      ['Location', (d) => d.geography],
      ['Record-declared terms', (d) => d.license.toUpperCase()],
      ['Source', (d) => d.url],
    ];
    $('#compare-content').innerHTML =
      `<div class="scroll-table"><table><thead><tr><th>Attribute</th>${rows.map((d) => `<th>${esc(d.name)}</th>`).join('')}</tr></thead><tbody>${fields.map(([name, fn]) => `<tr><td>${esc(name)}</td>${rows.map((d) => `<td>${name === 'Source' ? link('Published record', fn(d)) : esc(fn(d))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="graph-help">Reported reference does not certify annotation coverage, geographic independence or an executable preparation pipeline.</p>`;
    $('#compare-dialog').showModal();
  }
  function download(value, name) {
    downloadJSON(doc, value, name);
  }

  const FILTER_LABELS = {
    platform: 'Platform',
    unit: 'Data unit',
    reference: 'Instance reference',
    preparation: 'Task preparation',
  };
  const FILTER_VALUES = {
    unit: {
      plots: 'Plot / scene clouds',
      mixed: 'Plots + tree exports',
      trees: 'Isolated-tree exports',
      unknown: 'Unit not reviewed',
    },
    reference: {
      plots: 'Plot-level IDs reported',
      trees: 'Tree identities only',
      none: 'No instance labels',
      unknown: 'Not reviewed',
    },
    preparation: {
      ready: 'Validated archive preparation',
      tbd: 'Pipeline TBD',
      blocked: 'Rights review required',
    },
  };
  function clearFilters() {
    state.search = '';
    $('#search').value = '';
    ['platform', 'unit', 'reference', 'preparation'].forEach((key) => {
      state[key] = 'all';
      $('#' + key).value = 'all';
    });
    render();
  }
  function renderActiveFilters() {
    const box = $('#active-filters');
    if (!box) return;
    const chips = [];
    if (state.search) chips.push({ key: 'search', label: `Search: “${state.search}”` });
    for (const key of Object.keys(FILTER_LABELS))
      if (state[key] !== 'all')
        chips.push({
          key,
          label: `${FILTER_LABELS[key]}: ${FILTER_VALUES[key]?.[state[key]] || state[key]}`,
        });
    box.hidden = !chips.length;
    box.innerHTML =
      chips
        .map(
          (chip) =>
            `<button class="filter-chip" data-clear-filter="${esc(chip.key)}">${esc(chip.label)}<span aria-hidden="true">×</span></button>`,
        )
        .join('') +
      (chips.length > 1
        ? '<button class="text-button" data-clear-filter="all">Clear all</button>'
        : '');
  }
  let urlTimer;
  function syncUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(updateUrl, 300);
  }
  function updateUrl() {
    const params = new URLSearchParams();
    params.set('task', task.id);
    if (state.taskUse !== 'training') params.set('use', state.taskUse);
    if (task.id === 'species' && state.rank !== 'species') params.set('rank', state.rank);
    if (state.search) params.set('q', state.search);
    if (state.compare.size) params.set('compare', [...state.compare].join(','));
    for (const [key, value] of Object.entries(state.taskVariables)) params.set('var_' + key, value);
    for (const key of ['platform', 'unit', 'reference', 'preparation'])
      if (state[key] !== 'all') params.set(key, state[key]);
    experimentToUrl(params, experiment);
    const query = params.toString();
    try {
      history.replaceState(
        null,
        '',
        location.pathname + (query ? `?${query}` : '') + location.hash,
      );
      lastLocation = location.href;
    } catch {
      /* Browser rate-limited replaceState; the visible UI state still applies. */
    }
  }
  function initFromUrl(initial = false) {
    const params = new URLSearchParams(location.search);
    const requested = params.get('task') || (initial ? saved.activeTask : 'instances');
    if (['instances', 'species'].includes(requested) && requested !== task.id)
      selectTask(requested, true, true);
    if (!state.taskRunning)
      experiment = experimentFromUrl(params, experiment, data, task.id, initial);
    if (initial && taskStates.has(task.id)) Object.assign(state, taskStates.get(task.id));
    state.compare = new Set(
      (params.get('compare') || '')
        .split(',')
        .filter((id) => Object.hasOwn(byId, id))
        .slice(0, 3),
    );
    if (!initial || params.has('use'))
      state.taskUse = Object.hasOwn(task.requirements.uses, params.get('use'))
        ? params.get('use')
        : 'training';
    if (!initial || params.has('rank'))
      state.rank = params.get('rank') === 'genus' ? 'genus' : 'species';
    if (!initial) state.taskVariables = {};
    for (const variable of task.requirements.variables) {
      const value = params.get('var_' + variable.key);
      if (['required', 'optional', 'off'].includes(value))
        state.taskVariables[variable.key] = value;
    }
    state.search = params.get('q') || '';
    $('#search').value = state.search;
    for (const key of ['platform', 'unit', 'reference', 'preparation']) {
      const value = params.get(key);
      state[key] = [...$('#' + key).options].some((option) => option.value === value)
        ? value
        : 'all';
      $('#' + key).value = state[key];
    }
  }

  const VIEW_TITLES = {
    datasets: 'Sources',
    workbench: 'Experiment',
    model: 'Data model',
  };
  const VIEW_HEADINGS = {
    datasets: [
      'Find a source for tree segmentation.',
      'Compare source coverage, limitations and audited preparation for your data requirements.',
    ],
    workbench: [
      'Prepare a dataset for your model.',
      'Choose a source, inspect its audited pipeline and prepare data for your task requirements.',
    ],
    model: [
      'Navigate the shared data model for each task.',
      'Sources, audited preparation flows and the data contract each task consumes. Reported support is not an admitted pipeline.',
    ],
  };
  function render() {
    persist();
    renderDatasets();
    renderActiveFilters();
    syncUrl();
    $('#compare-count').textContent = state.compare.size;
    $('#compare-open').disabled = state.compare.size < 2;
    $('#compare-open').hidden = state.view !== 'datasets';
    $('.toolbar').hidden = state.view !== 'datasets';
    $('.task-request').hidden =
      state.view === 'model' || (state.view === 'workbench' && state.section !== 'objectives');
    if (task.id === 'species' && state.view !== 'model') {
      $('.page-heading h1').textContent =
        state.view === 'workbench'
          ? 'Build a tree classification dataset.'
          : 'Find tree classification data.';
      $('.page-heading .eyebrow').textContent = 'TREE TAXONOMIC CLASSIFICATION';
      $('.page-heading p').textContent =
        'Native sensor observations, explicit reference by rank and audited source limitations.';
    }
    $('#active-filters').hidden ||= state.view !== 'datasets';
    const view = state.view;
    $('#breadcrumb-view').textContent = VIEW_TITLES[view] || 'Sources';
    const [heading, subtitle] = VIEW_HEADINGS[view] || VIEW_HEADINGS.datasets;
    $('.page-heading h1').textContent = heading;
    $('.page-heading p').textContent = subtitle;
    if (view === 'workbench') {
      const headings = {
        objectives: [
          'What should this dataset support?',
          'Choose a task and the requirements its prepared data must satisfy.',
        ],
        data: [
          'Find data for your objectives.',
          'Inspect coverage, then configure the subsets you want to include.',
        ],
        preparation: [
          'Choose the data representation.',
          'Reviewed routes preserve native observations and their source-specific semantics.',
        ],
        splits: [
          'Define what stays unseen.',
          'Inspect the current assignments and the evidence needed for independent evaluation.',
        ],
        review: [
          'Review your dataset as a whole.',
          'Check coverage, expected outputs and unresolved evidence before execution.',
        ],
        runs: [
          'Runs and datasets.',
          'Each execution retains its reviewed plan and its own validation evidence.',
        ],
        service: [
          'Optional local data service.',
          'Inspect originals or prepare the reviewed full release on the service host.',
        ],
      };
      [$('.page-heading h1').textContent, $('.page-heading p').textContent] =
        headings[state.section];
      $('#breadcrumb-view').textContent = 'Experiment / ' + state.section;
    } else if (view === 'datasets' && task.id === 'species') {
      $('.page-heading h1').textContent = 'Find tree classification data.';
    }
    $('.page-heading .eyebrow').textContent = task.title || task.name;
    if (joint()) {
      $('.page-heading .eyebrow').textContent = 'TREE INSTANCES + TAXONOMY';
      if (view === 'datasets') {
        $('.page-heading h1').textContent = 'Find data for both targets.';
        $('.page-heading p').textContent =
          'Shared reference is reported separately from preparation readiness.';
      }
    }
    $('#view-workbench').dataset.workspaceSection = state.section;
    $$('.nav-item').forEach((b) => {
      const active =
        b.dataset.view === state.view &&
        (state.view !== 'workbench' ||
          (b.dataset.workspaceSection === 'runs') === (state.section === 'runs'));
      b.classList.toggle('active', active);
      b.setAttribute('aria-current', active ? 'page' : 'false');
    });
    $$('.view').forEach((el) => (el.hidden = el.id !== `view-${state.view}`));
  }
  function selectView(view, section = 'objectives') {
    state.view = view;
    state.section = parseWorkspaceRoute(workspaceHash(view, section)).section;
    clearTimeout(urlTimer);
    updateUrl();
    const hash = workspaceHash(view, state.section);
    if (location.hash !== hash)
      history.pushState(null, '', location.pathname + location.search + hash);
    lastLocation = location.href;
    render();
    document.dispatchEvent(
      new CustomEvent('canopy-view', { detail: { view, section: state.section } }),
    );
    window.scrollTo(0, 0);
    $('.page-heading h1').focus({ preventScroll: true });
  }
  $('.skip').addEventListener('click', (event) => {
    event.preventDefault();
    $('.page-heading h1').focus();
  });
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.sourceDownload && serviceConnected) {
      $('#detail-dialog').close();
      selectView('workbench', 'service');
      document.dispatchEvent(
        new CustomEvent('canopy-inspect-source', {
          detail: { record_id: target.dataset.sourceDownload },
        }),
      );
    }
    if (target.dataset.taskPrepare) {
      if (joint()) return;
      const request = selection.assess(target.dataset.taskPrepare, taskRequest());
      if (request.status !== 'ready') return;
      $('#detail-dialog').close();
      selectView('workbench', 'data');
      document.dispatchEvent(
        new CustomEvent('canopy-prepare-task', {
          detail: {
            ...taskRequest(),
            task_ref: 'task:' + task.id,
            source_ref:
              byId[target.dataset.taskPrepare].source_ref || 'zenodo:' + target.dataset.taskPrepare,
            record_id: target.dataset.taskPrepare,
          },
        }),
      );
    }
    if (target.dataset.experimentAdd) {
      setExperiment({ sources: [...experiment.sources, target.dataset.experimentAdd] });
      selectView('workbench', 'data');
    }
    if (target.dataset.view) selectView(target.dataset.view, target.dataset.workspaceSection);
    if (target.dataset.detail) detail(target.dataset.detail);
    if (target.dataset.compare) toggleCompare(target.dataset.compare);
    if (target.dataset.clearFilters) clearFilters();
    if (target.dataset.clearFilter) {
      const key = target.dataset.clearFilter;
      if (key === 'all') clearFilters();
      else {
        if (key === 'search') {
          state.search = '';
          $('#search').value = '';
        } else {
          state[key] = 'all';
          $('#' + key).value = 'all';
        }
        render();
      }
    }
    if (target.classList.contains('close-dialog')) target.closest('dialog').close();
  });
  document.addEventListener('keydown', (e) => {
    if (
      e.key === '/' &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) &&
      !$('dialog[open]')
    ) {
      e.preventDefault();
      selectView('datasets');
      $('#search').focus();
    }
  });
  function populateTaskControls() {
    $('#task-use').innerHTML = Object.entries(task.requirements.uses)
      .map(([key, use]) => `<option value="${esc(key)}">${esc(use.label)}</option>`)
      .join('');
    $('#task-variables').innerHTML = task.requirements.variables
      .map(
        (v) =>
          `<label title="${esc(v.detail)}">${esc(v.label)}<select id="variable-${esc(v.key)}"><option value="required">Required</option><option value="optional">Optional</option><option value="off">Do not use</option></select></label>`,
      )
      .join('');
    $('#task-use').onchange = (e) => {
      state.taskUse = e.target.value;
      taskChanged();
    };
    for (const v of task.requirements.variables)
      $('#variable-' + v.key).onchange = (e) => {
        state.taskVariables[v.key] = e.target.value;
        taskChanged();
      };
  }
  function selectTask(id, deferRender = false, preserveExperiment = false) {
    if (state.taskRunning) return;
    const changed = id !== task.id;
    if (!preserveExperiment) experiment = { ...experiment, tasks: [id] };
    if (!changed) {
      if (!deferRender) {
        renderTaskRequest();
        render();
        document.dispatchEvent(new CustomEvent('canopy-experiment-change'));
      }
      return;
    }
    taskStates.set(task.id, {
      taskUse: state.taskUse,
      taskVariables: state.taskVariables,
      rank: state.rank,
    });
    selection.setTask(id);
    task = selection.task;
    Object.assign(
      state,
      taskStates.get(id) || { taskUse: 'training', taskVariables: {}, rank: 'species' },
    );
    $('#preparation-task').value = 'task:' + id;
    populateTaskControls();
    if (deferRender) return;
    taskChanged();
    document.dispatchEvent(
      new CustomEvent('canopy-task-change', { detail: { task_ref: 'task:' + id } }),
    );
  }
  function setExperiment(update) {
    if (state.taskRunning) return;
    const previousTask = task.id;
    experiment = normalizeExperiment({ ...experiment, ...update }, data, task.id);
    if (experiment.tasks.length === 1) selectTask(experiment.tasks[0], true, true);
    renderTaskRequest();
    render();
    updateUrl();
    if (previousTask !== task.id) {
      document.dispatchEvent(new CustomEvent('canopy-task-request', { detail: taskRequest() }));
      document.dispatchEvent(
        new CustomEvent('canopy-task-change', { detail: { task_ref: 'task:' + task.id } }),
      );
    }
    document.dispatchEvent(new CustomEvent('canopy-experiment-change'));
  }
  $('#preparation-task').value = 'task:' + task.id;
  $('#preparation-task').onchange = (e) => selectTask(e.target.value.replace('task:', ''));
  $('#task-rank').onchange = (e) => {
    state.rank = e.target.value;
    taskChanged();
  };
  $('#experiment-rank').onchange = (e) => setExperiment({ rank: e.target.value });
  document.addEventListener('canopy-select-task', (e) =>
    selectTask(e.detail.task_ref.replace('task:', '')),
  );
  populateTaskControls();
  renderTaskRequest();
  $('#search').addEventListener('input', (e) => {
    state.search = e.target.value;
    render();
  });
  ['platform', 'unit', 'reference', 'preparation'].forEach((key) =>
    $('#' + key).addEventListener('change', (e) => {
      state[key] = e.target.value;
      render();
    }),
  );
  document.addEventListener('change', (e) => {
    if (e.target.dataset.compareCheck) toggleCompare(e.target.dataset.compareCheck);
  });
  $('#detail-dialog').addEventListener('close', () => {
    if (state.view === 'datasets')
      $(`[data-detail="${state.detailSource}"]`)?.focus({ preventScroll: true });
  });
  $('#reset').addEventListener('click', clearFilters);
  $('#compare-open').addEventListener('click', showCompare);
  $('#export').addEventListener('click', () => download(data, 'canopy-catalog.json'));
  let lastLocation = location.href;
  const locationChanged = () => {
    if (lastLocation === location.href) return;
    lastLocation = location.href;
    clearTimeout(urlTimer);
    const previousTask = task.id;
    const previousRequest = JSON.stringify(taskRequest());
    const previousRoute = workspaceHash(state.view, state.section);
    Object.assign(state, parseWorkspaceRoute(location.hash));
    initFromUrl();
    renderTaskRequest();
    render();
    if (previousTask !== task.id)
      document.dispatchEvent(
        new CustomEvent('canopy-task-change', { detail: { task_ref: 'task:' + task.id } }),
      );
    if (previousRequest !== JSON.stringify(taskRequest()))
      document.dispatchEvent(new CustomEvent('canopy-task-request', { detail: taskRequest() }));
    document.dispatchEvent(
      new CustomEvent('canopy-view', { detail: { view: state.view, section: state.section } }),
    );
    document.dispatchEvent(new CustomEvent('canopy-experiment-change'));
    if (previousRoute !== workspaceHash(state.view, state.section) || previousTask !== task.id)
      $('.page-heading h1').focus({ preventScroll: true });
  };
  window.addEventListener('hashchange', locationChanged);
  window.addEventListener('popstate', locationChanged);
  $$('dialog').forEach((d) =>
    d.addEventListener('click', (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
          d.close();
      }
    }),
  );
  document.addEventListener('canopy-preparation-state', (e) => {
    state.taskRunning = e.detail.running;
    renderTaskRequest();
  });
  document.addEventListener('canopy-service-state', (e) => {
    serviceConnected = e.detail.connected;
    $$('[data-source-download]').forEach((b) => (b.disabled = !serviceConnected));
    $$('.source-service-note').forEach((p) => (p.textContent = sourceServiceNote()));
  });
  Object.assign(state, parseWorkspaceRoute(location.hash));
  initFromUrl(true);
  renderTaskRequest();
  $('#dataset-count').textContent = data.datasets.length;
  $('#snapshot-date').textContent =
    `Snapshot · ${new Date(data.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  updateAvailability();
  render();
  return {
    catalog: data,
    selection,
    getTaskRequest: taskRequest,
    navigate: selectView,
    getState: () => ({ ...state, compare: [...state.compare] }),
    getExperiment: () => normalizeExperiment(experiment, data, task.id),
    setExperiment,
  };
}

import { escapeHTML as esc, downloadJSON } from '../shared/dom.js';
/* A dependency-free, offline viewer. This application never modifies LiDAR files. */
import { createTaskSelection } from './task-selection.js';

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
  const task = selection.task;
  const $ = (selector, root = doc) => root.querySelector(selector);
  const $$ = (selector, root = doc) => [...root.querySelectorAll(selector)];
  const number = (n) => Number(n).toLocaleString('en-US');
  const compact = (n) =>
    n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : number(n);
  const byId = Object.fromEntries(data.datasets.map((d) => [d.id, d]));
  const state = {
    view: 'datasets',
    search: '',
    platform: 'all',
    unit: 'all',
    reference: 'all',
    preparation: 'all',
    taskUse: 'training',
    taskVariables: {},
    taskRunning: false,
    compare: new Set(),
  };
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
    return `<dl class="source-readiness"><div><dt>Instance reference</dt><dd><span class="source-status reference-${esc(s.instance_reference.status)}">${esc(s.instance_reference.label)}</span></dd></div><div><dt>Task preparation</dt><dd><span class="source-status preparation-${esc(s.preparation.status)}">${esc(s.preparation.label)}</span></dd></div></dl>`;
  };
  const sourceServiceNote = () =>
    (serviceConnected
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
      selection.matches(d.id, taskRequest())
    );
  };
  const visibleDatasets = () => data.datasets.filter(matches);
  function taskRequest() {
    const variables = { ...state.taskVariables };
    for (const key of task.requirements.uses[state.taskUse].required_variables)
      delete variables[key];
    return selection.normalize(state.taskUse, variables);
  }
  function renderTaskRequest() {
    const request = taskRequest(),
      use = task.requirements.uses[request.use];
    $('#task-use').value = request.use;
    $('#task-use').disabled = state.taskRunning;
    for (const variable of task.requirements.variables) {
      const input = $('#variable-' + variable.key);
      input.value = request.variables[variable.key];
      input.disabled = state.taskRunning || use.required_variables.includes(variable.key);
    }
    $('#task-request-summary').textContent = use.detail;
  }
  function requestFit(d, action = false) {
    const result = selection.assess(d.id, taskRequest());
    const labels = (key) => task.requirements.variables.find((v) => v.key === key).label;
    const omitted = Object.keys(result.omitted).map(labels);
    const channels = task.preparation_sources[d.id].native_reflectance;
    return `<div class="request-fit"><strong>${result.status === 'ready' ? 'Audited pipeline matches this request' : 'Preparation for this request: TBD / blocked'}</strong>${omitted.length ? `<p>Not produced: ${esc(omitted.join(', '))}.</p>` : ''}${channels.length ? `<p>${channels.length} native reflectance channels documented (${esc(channels.map((c) => c.wavelength_nm + ' nm').join(', '))}); feature preparation remains TBD.</p>` : ''}${action && result.status === 'ready' ? `<button class="button" data-task-prepare="${esc(d.id)}">Prepare data for this request</button>` : ''}</div>`;
  }
  function taskChanged() {
    renderTaskRequest();
    render();
    document.dispatchEvent(new CustomEvent('canopy-task-request', { detail: taskRequest() }));
  }
  document.addEventListener('canopy-set-task-request', (event) => {
    if (state.taskRunning) return;
    const normalized = selection.normalize(event.detail.use, event.detail.variables);
    state.taskUse = normalized.use;
    state.taskVariables = { ...normalized.variables };
    taskChanged();
  });
  function sourceReview(d) {
    const r = d.review;
    if (!r) return '<p>Source review is pending.</p>';
    return `<h4>Observation unit</h4><p>${esc(r.observation_unit)}</p><h4>Reported by the source</h4>${r.source_facts.map((f) => `<p>${esc(f.text)} ${link(f.label, f.url)}</p>`).join('')}<h4>Published protocol</h4><p>${esc(r.published_protocol)}</p><h4>Local study context</h4><p>${esc(d.study_context)}</p><h4>Saved local observations</h4><ul>${r.local_observations.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p class="evidence-tag">${r.observations_current ? 'Observation metadata matches the reviewed snapshot.' : 'Metadata changed; these historical observations need rechecking.'}</p><h4>Unresolved before scientific use</h4><ul>${r.open_questions.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p class="evidence-tag">Reviewed ${esc(r.reviewed_at)} · ${esc(r.scope)}</p>`;
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

  /* Cards communicate uniform state; the audited per-source detail stays in the dialog. */
  const REFERENCE_STATUS_LABELS = {
    plots: 'Tree IDs per plot',
    trees: 'Tree IDs in tree exports',
    none: 'No instance labels',
    unknown: 'Reference not reviewed',
  };
  const PREPARATION_STATUS_LABELS = {
    ready: 'Validated preparation',
    tbd: 'Pipeline TBD',
    blocked: 'Rights review required',
  };
  function cardStatuses(d) {
    const s = discovery(d);
    return `<div class="card-status"><span class="source-status reference-${esc(s.instance_reference.status)}">${esc(REFERENCE_STATUS_LABELS[s.instance_reference.status] || 'Reference not reviewed')}</span><span class="source-status preparation-${esc(s.preparation.status)}">${esc(PREPARATION_STATUS_LABELS[s.preparation.status] || 'Pipeline TBD')}</span></div>`;
  }
  function cardHtml(d) {
    const s = discovery(d);
    const upcoming = s.preparation.status !== 'ready';
    const fit = upcoming ? null : selection.assess(d.id, taskRequest());
    const fitLine = !fit
      ? ''
      : `<p class="fit-line ${fit.status === 'ready' ? 'ok' : 'no'}">${fit.status === 'ready' ? 'Audited pipeline covers this request.' : 'Admitted pipeline does not cover the current request.'}</p>`;
    return `<article class="dataset-card source-card${upcoming ? ' upcoming' : ''}" data-source="${d.id}"><div class="card-top">${upcoming ? badge('Upcoming', 'neutral') : ''}${badge(d.modalities.join(' · '))}<span class="source-unit">${esc(s.unit_label)}</span></div><h3>${esc(d.name)}</h3><p class="source-location" title="${esc(d.geography)}">${esc(d.geography)}</p>${cardStatuses(d)}${fitLine}<p class="card-meta">${recordSize(d)} · ${d.assets} ${d.assets === 1 ? 'asset' : 'assets'} in the pinned record</p><div class="card-bottom"><label class="card-compare"><input type="checkbox" data-compare-check="${d.id}" ${state.compare.has(d.id) ? 'checked' : ''}>Compare</label>${fit?.status === 'ready' ? `<button class="button small" data-task-prepare="${d.id}">Prepare</button>` : ''}<button data-detail="${d.id}">View source & preparation ↗</button></div></article>`;
  }
  function renderDatasets() {
    const rows = visibleDatasets();
    $('#catalog-count').textContent =
      `${rows.length} of ${data.datasets.length} source records · ${rows.filter((d) => selection.assess(d.id, taskRequest()).status === 'ready').length} with an audited pipeline for this request`;
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
    $('#detail-dialog-title').textContent = d.name;
    $('#dialog-detail').innerHTML =
      `<div class="source-detail"><div class="badges">${badge(d.modalities.join(' · '))}${badge(s.unit_label)}${badge(`Pinned record ${d.id}`)}</div><p class="source-location">${esc(d.geography)}</p>${readinessHtml(d)}${requestFit(d, true)}<h3>What can I use?</h3><p>${esc(s.coverage)}</p><p class="notice">${esc(s.limitation)}</p><div class="source-actions">${link('Open provider record', d.url)}<button class="button" data-source-download="${d.id}" ${serviceConnected ? '' : 'disabled'}>Review original downloads</button><button class="button" data-compare="${d.id}">${state.compare.has(id) ? '✓ Remove from comparison' : '+ Add to comparison'}</button></div><p class="source-service-note">${esc(sourceServiceNote())}</p><details class="source-section" open><summary>Preparation for this task · ${s.preparation.status === 'ready' ? 'validated archive scope' : s.preparation.status === 'blocked' ? 'review required' : 'TBD'}</summary><p>${esc(s.preparation.detail)}</p><p>Whole pinned record: ${recordSize(d)} in ${d.assets} assets. This includes supporting files where present; extracted data needs additional space.</p></details><details class="source-section"><summary>Source evidence and unresolved questions</summary>${sourceReview(d)}</details><details class="source-section"><summary>Native fields, coordinates and declared terms</summary><h4>Source annotations</h4><p>${esc(d.labels)}</p>${classSemantics(d)}<h4>Coordinates</h4><p>${esc(d.coordinate_policy)}</p><p>${(d.coordinate_references || []).map((c) => `${esc(c.value)}: ${c.files} files`).join(' · ') || 'Conversion deferred; no normalized coordinate audit.'}</p><h4>Native field names</h4><p>Names from saved schemas; types, ranges and units are not uniformly audited.</p><div class="field-pills">${d.source_fields.map((f) => `<code>${esc(f)}</code>`).join('') || 'Conversion deferred; inspect source definitions.'}</div>${nativeMeasurements(d)}<h4>Record-declared terms</h4><p>${esc(d.license.toUpperCase())}. Intended-use and component terms still require review.</p><h4>Historical local representation</h4><p>${number(d.cloud_count)} normalized files · ${number(d.chunks)} chunks · ${compact(d.points)} stored points. File counts mix plots and derived trees where applicable; they do not count independent sites.</p><h4>Provider metadata SHA256</h4><code class="raw-path">${esc(d.source_metadata_sha256)}</code></details></div>`;
    const dialog = $('#detail-dialog');
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
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
    if ($('#detail-dialog').open) detail(id);
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
    urlTimer = setTimeout(() => {
      const params = new URLSearchParams();
      if (state.search) params.set('q', state.search);
      for (const key of ['platform', 'unit', 'reference', 'preparation'])
        if (state[key] !== 'all') params.set(key, state[key]);
      const query = params.toString();
      try {
        history.replaceState(
          null,
          '',
          location.pathname + (query ? `?${query}` : '') + location.hash,
        );
      } catch {
        /* Browser rate-limited replaceState; the visible UI state still applies. */
      }
    }, 300);
  }
  function initFromUrl() {
    const params = new URLSearchParams(location.search);
    state.search = params.get('q') || '';
    $('#search').value = state.search;
    for (const key of ['platform', 'unit', 'reference', 'preparation']) {
      const value = params.get(key);
      if (value) {
        state[key] = value;
        $('#' + key).value = value;
      }
    }
  }

  function render() {
    renderDatasets();
    renderActiveFilters();
    syncUrl();
    $('#compare-count').textContent = state.compare.size;
    $('#compare-open').disabled = state.compare.size < 2;
    $('#compare-open').hidden = state.view !== 'datasets';
    $('.toolbar').hidden = state.view !== 'datasets';
    const downloading = state.view === 'workbench';
    $('#breadcrumb-view').textContent = downloading ? 'Workbench' : 'Sources';
    $('.page-heading h1').textContent = downloading
      ? 'Prepare a dataset for your model.'
      : 'Find a source for tree segmentation.';
    $('.page-heading p').textContent = downloading
      ? 'Choose a source, inspect its audited pipeline and prepare data for your task requirements.'
      : 'Compare reference coverage and limitations. FOR-instance archive preparation is validated; other adapters remain work in progress.';
    $$('.nav-item').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === state.view);
      b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false');
    });
    $$('.view').forEach((el) => (el.hidden = el.id !== `view-${state.view}`));
  }
  function selectView(view) {
    state.view = view;
    location.hash = view;
    render();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.sourceDownload && serviceConnected) {
      $('#detail-dialog').close();
      document.dispatchEvent(
        new CustomEvent('canopy-inspect-source', {
          detail: { record_id: target.dataset.sourceDownload },
        }),
      );
    }
    if (target.dataset.taskPrepare) {
      const request = selection.assess(target.dataset.taskPrepare, taskRequest());
      if (request.status !== 'ready') return;
      $('#detail-dialog').close();
      selectView('workbench');
      document.dispatchEvent(
        new CustomEvent('canopy-prepare-task', {
          detail: { ...taskRequest(), record_id: target.dataset.taskPrepare },
        }),
      );
    }
    if (target.dataset.view) selectView(target.dataset.view);
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
  $('#task-use').innerHTML = Object.entries(task.requirements.uses)
    .map(([key, use]) => `<option value="${esc(key)}">${esc(use.label)}</option>`)
    .join('');
  $('#task-variables').innerHTML = task.requirements.variables
    .map(
      (v) =>
        `<label title="${esc(v.detail)}">${esc(v.label)}<select id="variable-${esc(v.key)}"><option value="required">Required</option><option value="optional">Optional</option><option value="off">Do not use</option></select></label>`,
    )
    .join('');
  $('#task-use').addEventListener('change', (e) => {
    state.taskUse = e.target.value;
    taskChanged();
  });
  for (const v of task.requirements.variables)
    $('#variable-' + v.key).addEventListener('change', (e) => {
      state.taskVariables[v.key] = e.target.value;
      taskChanged();
    });
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
  $('#reset').addEventListener('click', clearFilters);
  $('#compare-open').addEventListener('click', showCompare);
  $('#export').addEventListener('click', () => download(data, 'canopy-catalog.json'));
  window.addEventListener('hashchange', () => {
    state.view = location.hash === '#workbench' ? 'workbench' : 'datasets';
    render();
  });
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
  state.view = location.hash === '#workbench' ? 'workbench' : 'datasets';
  initFromUrl();
  $('#dataset-count').textContent = data.datasets.length;
  $('#snapshot-date').textContent =
    `Snapshot · ${new Date(data.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  updateAvailability();
  render();
  return {
    catalog: data,
    selection,
    getTaskRequest: taskRequest,
    getState: () => ({ ...state, compare: [...state.compare] }),
  };
}

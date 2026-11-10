import { referenceFor } from '../experiment.js?v=joint-v1';
/* Source discovery summarizes existing admissions without granting execution. */
export function sourceOverview(catalog, source, jointSource = null) {
  const routes = catalog.tasks.flatMap((task) =>
    (task.preparation_sources?.[source.id]?.pipelines || []).map((pipeline) => ({
      id: pipeline.id,
      tasks: [task.id],
      label: `${task.name}: ${source.discovery?.preparation?.label || 'Validated preparation'}`,
    })),
  );
  const sourceRef = source.source_ref || `zenodo:${source.id}`;
  if (
    jointSource?.source_ref === sourceRef &&
    jointSource.admission?.status === 'admitted' &&
    jointSource.plots?.length &&
    [...jointSource.admission.approved_plots].sort().join('\n') ===
      jointSource.plots
        .map((plot) => plot.path)
        .sort()
        .join('\n')
  ) {
    routes.push({
      id: jointSource.pipeline_ref,
      tasks: ['instances', 'species'],
      label: `Joint instances + taxonomy: ${jointSource.plots.length} admitted plots; unassigned partitions`,
    });
  }
  const taxonomy = referenceFor(source, 'species');
  const taskSupport = {
    ...source.source_task_support,
    species: { status: taxonomy.status, reason: taxonomy.label },
  };
  const references = Object.entries(taskSupport)
    .filter(([, value]) => ['documented', 'partial'].includes(value.status))
    .map(([key]) => catalog.tasks.find((task) => task.id === key)?.name || key);
  const legacy = source.discovery?.preparation;
  return {
    routes,
    limitation:
      source.id === '16910335'
        ? 'No enabled preparation for the versioned manual plot references. Automatic outputs are predictions, not reference labels.'
        : source.discovery?.limitation || null,
    references,
    taskSupport,
    preparation: {
      status: routes.length
        ? 'ready'
        : !jointSource && source.id === '19127709'
          ? 'unknown'
          : legacy?.status === 'blocked'
            ? 'blocked'
            : 'tbd',
      label: routes.length
        ? 'Validated preparation available'
        : legacy?.status === 'blocked'
          ? legacy.label
          : !jointSource && source.id === '19127709'
            ? 'Joint preparation scope unavailable'
            : 'No enabled preparation',
      detail: routes.length
        ? routes.map((route) => route.label).join(' · ') +
          (source.id === '19127709'
            ? '. Only the listed complete plots are admitted; whole-release coverage and independent evaluation are not established.'
            : '. ' + (legacy?.detail || ''))
        : !jointSource && source.id === '19127709'
          ? 'The joint scope metadata could not be checked. Preparation availability is unknown; retry loading the catalogue.'
          : legacy?.detail || 'No validated preparation is registered.',
    },
  };
}

export function exportSources(catalog, sources, jointSource = null) {
  return {
    schema_version: '1.0.0',
    snapshot_at: catalog.generated_at,
    scope:
      'Published sources and existing preparation admissions. Historical local workspace counts are excluded.',
    sources: sources.map((source) => ({
      source_ref: source.source_ref || `zenodo:${source.id}`,
      name: source.name,
      version: source.version,
      url: source.url,
      license: source.license,
      modalities: source.modalities,
      geography: source.geography,
      data_unit: source.discovery?.unit_label || null,
      published_coverage: source.discovery?.coverage || null,
      record_download_bytes: source.download_bytes ?? null,
      record_assets: source.assets ?? null,
      task_support: sourceOverview(catalog, source, jointSource).taskSupport,
      preparations: sourceOverview(catalog, source, jointSource).routes,
      preparation_detail: sourceOverview(catalog, source, jointSource).preparation.detail,
      limitations: sourceOverview(catalog, source, jointSource).limitation,
      evidence: source.review?.source_facts || [],
      reviewed_at: source.review?.reviewed_at || null,
      open_questions: source.review?.open_questions || [],
    })),
  };
}

export function sourcesCSV(snapshot) {
  const fields = [
    'source_ref',
    'name',
    'version',
    'url',
    'license',
    'data_unit',
    'published_coverage',
    'record_download_bytes',
    'record_assets',
    'preparation_detail',
    'limitations',
    'reviewed_at',
    'open_questions',
  ];
  const cell = (value) =>
    `"${String(Array.isArray(value) ? value.join('; ') : (value ?? '')).replaceAll('"', '""')}"`;
  return (
    [
      fields.join(','),
      ...snapshot.sources.map((source) => fields.map((field) => cell(source[field])).join(',')),
    ].join('\r\n') + '\r\n'
  );
}

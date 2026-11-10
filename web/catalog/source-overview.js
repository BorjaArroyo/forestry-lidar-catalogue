/* All views consume generated admission summaries; execution remains independently gated. */
export function sourceOverview(catalog, source) {
  const sourceRef = source.source_ref || `zenodo:${source.id}`;
  const routes = (catalog.preparations || [])
    .filter((route) => route.source_ref === sourceRef)
    .map((route) => ({
      ...route,
      tasks: route.task_refs.map((task) => task.replace('task:', '')),
      label: `${route.name}: ${route.scope}`,
    }));
  const taskSupport = source.source_task_support || {};
  const references = Object.entries(taskSupport)
    .filter(([, value]) => ['documented', 'partial', 'derived_only'].includes(value.status))
    .map(([key, value]) => {
      const name = catalog.tasks.find((task) => task.id === key)?.name || key;
      return (
        name +
        (value.status === 'partial'
          ? ' (partial)'
          : value.status === 'derived_only'
            ? ' (derived only)'
            : '')
      );
    });
  const recorded = source.discovery?.preparation;
  return {
    routes,
    taskSupport,
    references,
    limitation: source.discovery?.limitation || null,
    preparation: {
      status: routes.length ? 'ready' : recorded?.status === 'blocked' ? 'blocked' : 'tbd',
      label: routes.length
        ? 'Validated preparation available'
        : recorded?.status === 'blocked'
          ? recorded.label
          : 'No enabled preparation',
      detail: routes.length
        ? routes.map((route) => route.label + '. ' + route.detail).join(' · ')
        : recorded?.detail || 'No preparation is admitted.',
    },
  };
}

export function exportSources(catalog, sources) {
  return {
    schema_version: '1.1.0',
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
      coverage_summary: source.discovery?.coverage || null,
      record_download_bytes: source.download_bytes ?? null,
      record_assets: source.assets ?? null,
      task_support: sourceOverview(catalog, source).taskSupport,
      preparations: sourceOverview(catalog, source).routes,
      preparation_detail: sourceOverview(catalog, source).preparation.detail,
      limitations: sourceOverview(catalog, source).limitation,
      evidence: {
        provider: source.review?.source_facts || [],
        preparation: sourceOverview(catalog, source).routes.flatMap((route) => route.evidence),
      },
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
    'coverage_summary',
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

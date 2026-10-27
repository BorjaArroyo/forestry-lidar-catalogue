/* Presentation contracts never admit a source or an executable preparation. */
export const EXPERIMENT_TASKS = ['instances', 'species'];

export function referenceFor(source, task) {
  if (!source)
    return { reported: false, label: 'Reference not established', status: 'not_documented' };
  if (task === 'species') {
    if (source.classification)
      return { reported: true, label: 'Rank-specific taxonomy and validity', status: 'partial' };
    if (source.id === '19127709')
      return {
        reported: true,
        label: 'Partial taxonomy · genus-only labels retained',
        status: 'partial',
      };
    return {
      reported: false,
      label: 'Taxonomic mapping not established',
      status: 'not_documented',
    };
  }
  const support = source.source_task_support?.[task];
  const reported = ['partial', 'documented'].includes(support?.status);
  return {
    reported,
    label: reported
      ? source.discovery?.instance_reference.label || 'Instance reference reported'
      : 'Plot-instance reference not established',
    status: support?.status || 'not_documented',
  };
}

export function jointSources(catalog) {
  return catalog.datasets.filter((source) =>
    EXPERIMENT_TASKS.every((task) => referenceFor(source, task).reported),
  );
}

export function normalizeExperiment(value, catalog, activeTask = 'instances') {
  const input = value?.schema_version === '1.0.0' ? value : {};
  const tasks = EXPERIMENT_TASKS.filter(
    (task) => Array.isArray(input.tasks) && input.tasks.includes(task),
  );
  const candidates = new Set(jointSources(catalog).map((source) => source.id));
  return {
    schema_version: '1.0.0',
    tasks: tasks.length
      ? tasks
      : [EXPERIMENT_TASKS.includes(activeTask) ? activeTask : 'instances'],
    sources: [...new Set(Array.isArray(input.sources) ? input.sources : [])].filter((id) =>
      candidates.has(id),
    ),
    rank: input.rank === 'genus' ? 'genus' : 'species',
    target: ['species', 'genus', 'leaf_group'].includes(input.target)
      ? input.target
      : input.rank === 'genus'
        ? 'genus'
        : 'species',
    plots: [...new Set(Array.isArray(input.plots) ? input.plots : [])]
      .filter((path) => typeof path === 'string' && /^[a-zA-Z0-9_-]+\.laz$/.test(path))
      .slice(0, 50),
    policy: ['partial', 'joint'].includes(input.policy) ? input.policy : null,
    completeCrowns: input.completeCrowns === true,
  };
}

export function experimentFromUrl(params, previous, catalog, activeTask, initial = false) {
  const value = { ...previous };
  if (params.has('tasks')) {
    value.tasks = params.get('tasks').split(',');
    value.sources = (params.get('sources') || '').split(',');
    value.rank = params.get('rank');
    value.target = params.get('target') || params.get('rank') || 'species';
    value.plots = (params.get('plots') || '').split(',');
    value.policy = params.get('coverage');
    value.completeCrowns = params.get('crowns') === 'complete';
  } else if (!initial || params.has('task')) value.tasks = [activeTask];
  return normalizeExperiment(value, catalog, activeTask);
}

export function experimentToUrl(params, experiment) {
  if (experiment.tasks.length < 2) return;
  params.set('tasks', experiment.tasks.join(','));
  if (experiment.sources.length) params.set('sources', experiment.sources.join(','));
  if (experiment.rank !== 'species') params.set('rank', experiment.rank);
  if (experiment.target !== experiment.rank) params.set('target', experiment.target);
  if (experiment.plots.length) params.set('plots', experiment.plots.join(','));
  if (experiment.policy) params.set('coverage', experiment.policy);
  if (experiment.completeCrowns) params.set('crowns', 'complete');
}

export const JOINT_FIELDS = [
  ['inputs.xyz', 'float64', 'N × 3', 'Coordinates, frame and units declared'],
  ['targets.instance', 'int64', 'N', 'Point-level instance reference'],
  ['validity.instance', 'bool', 'N', 'Independent instance validity'],
  ['targets.taxonomy', 'int64', 'T', 'Vocabulary at the required rank'],
  ['validity.taxonomy', 'bool', 'T', 'Independent rank validity'],
  ['relations.point_to_tree', 'int64', 'N', 'Reference relationship; not a model input'],
  ['validity.point_to_tree', 'bool', 'N', 'Validity of each reference link'],
  ['trees.key', 'UTF-8', 'T', 'Release + plot + native tree ID'],
  [
    'tree_arrays.species / species_valid',
    'int64 / bool',
    'T',
    'Species label per tree and its validity',
  ],
  ['tree_arrays.genus / genus_valid', 'int64 / bool', 'T', 'Genus label per tree and its validity'],
  [
    'tree_arrays.leaf_group / leaf_group_valid',
    'int64 / bool',
    'T',
    'Derived conifer/broadleaf group; separate from taxonomy rank',
  ],
];

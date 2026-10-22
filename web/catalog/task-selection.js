/* Presentation only: the worker independently resolves and validates every request. */
export function createTaskSelection(catalog, initialTask = 'instances') {
  let task, requirements;
  function setTask(id) {
    const selected = catalog.tasks.find((t) => t.id === id && t.requirements);
    if (!selected) throw Error('Unknown preparation task');
    task = selected;
    requirements = task.requirements;
  }
  setTask(initialTask);
  function normalize(use = 'training', variables = {}) {
    if (!Object.hasOwn(requirements.uses, use)) throw Error('Unknown task use');
    const choices = Object.fromEntries(requirements.variables.map((v) => [v.key, v.default]));
    for (const [key, value] of Object.entries(variables)) {
      if (!Object.hasOwn(choices, key) || !['required', 'optional', 'off'].includes(value))
        throw Error('Unknown variable or requirement level');
      choices[key] = value;
    }
    for (const key of requirements.uses[use].required_variables) {
      if (Object.hasOwn(variables, key) && variables[key] !== 'required')
        throw Error('Task minimum cannot be relaxed: ' + key);
      choices[key] = 'required';
    }
    if (task.id === 'species' && use === 'inference') choices.taxonomy = 'off';
    return {
      use,
      variables: choices,
      ...(task.id === 'species' ? { task_ref: 'task:species', rank: 'species' } : {}),
    };
  }
  function assess(record, request) {
    request = normalize(request.use, request.variables);
    const context = task.preparation_sources[String(record)];
    if (!context) throw Error('Unknown reviewed source');
    if (context.pipelines.length > 1) throw Error('Ambiguous admitted task pipeline');
    const pipeline = context.pipelines[0];
    const outputs = pipeline?.variable_outputs || {};
    const included = {},
      omitted = {},
      blockers = [];
    for (const [key, choice] of Object.entries(request.variables)) {
      if (choice === 'off') continue;
      if (Object.hasOwn(outputs, key)) included[key] = outputs[key];
      else {
        const reason = 'No audited output for this variable in the selected source pipeline';
        omitted[key] = reason;
        if (choice === 'required') blockers.push(key + ': ' + reason);
      }
    }
    if (task.id === 'species') {
      const source = catalog.datasets.find((d) => d.id === String(record));
      if (
        !source?.classification ||
        !requirements.uses[request.use].allowed_partitions.some(
          (p) => source.classification.partitions[p],
        )
      )
        blockers.push('No published partition for this use');
      if (record === '13255198' && request.use === 'evaluation')
        blockers.push('FOR test has no public taxonomic reference');
    }
    if (!pipeline) blockers.unshift('No admitted source-specific preparation pipeline');
    return {
      ...request,
      status: blockers.length ? 'blocked' : 'ready',
      included,
      omitted,
      blockers,
      pipeline_ref: pipeline?.id || null,
      allowed_partitions: requirements.uses[request.use].allowed_partitions,
    };
  }
  function matches(record, request) {
    const sourceRecord = catalog.datasets.find((d) => d.id === String(record));
    if (task.id === 'species') return Boolean(sourceRecord?.classification);
    if (sourceRecord?.classification) return false;
    const result = assess(record, request);
    const context = task.preparation_sources[String(record)];
    const source = catalog.datasets.find((d) => d.id === String(record));
    if (
      request.variables.instance_reference === 'required' &&
      source.source_task_support.instances.status === 'unsupported'
    )
      return false;
    return requirements.variables.every((variable) => {
      if (request.variables[variable.key] !== 'required' || variable.purpose !== 'measurement')
        return true;
      if (Object.hasOwn(result.included, variable.key)) return true;
      // Native channels identify a candidate, not an executable preparation.
      return (
        variable.quantity === 'reflectance' &&
        new Set(context.native_reflectance.map((c) => c.wavelength_nm)).size >=
          variable.minimum_channels
      );
    });
  }
  return {
    get task() {
      return task;
    },
    setTask,
    normalize,
    assess,
    matches,
  };
}

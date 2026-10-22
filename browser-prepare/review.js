export const IMPORT_PLAN_CODE =
  'from canopy.task_package import decode_json; execution_plan = dataset_plan.check_dataset(task_model, source_contexts, decode_json(imported_plan_text), runtime_lock_sha256=runtime_lock_sha256); json.dumps(execution_plan)';

export function createPlanReview({ runtime, scope }) {
  function taskForRequest(py, profile, request) {
    py.globals.set('source_record_id', profile.recordId);
    py.globals.set('request_json', JSON.stringify(request.task_request || {}));
    const plan = JSON.parse(
      py.runPython(
        "task_request = json.loads(request_json); task_plan = plan_request(task_model, source_record_id, task_request.get('use', 'training'), task_request.get('variables')); check_plan(task_model, task_plan); json.dumps(task_plan)",
      ),
    );
    if (plan.pipeline_ref !== profile.pipelineRef)
      throw Error('Source implementation differs from the admitted pipeline');
    return plan;
  }

  async function review(request) {
    if (request.mode !== 'zenodo')
      throw Error('Dataset plan review currently supports Zenodo selections');
    const records =
      request.operation === 'import' ? request.records : request.subsets.map((s) => s.record_id);
    const { py, sources } = await runtime.loadContext(records);
    let plan;
    if (request.operation === 'import') {
      if (typeof request.plan_text !== 'string' || request.plan_text.length > 1048576)
        throw Error('Plan files must be JSON up to 1 MiB');
      py.globals.set('imported_plan_text', request.plan_text);
      plan = JSON.parse(py.runPython(IMPORT_PLAN_CODE));
    } else {
      py.globals.set('request_json', JSON.stringify(request.task_request));
      py.globals.set('subsets_json', JSON.stringify(request.subsets));
      plan = JSON.parse(
        py.runPython(
          "task_request = json.loads(request_json); execution_plan = dataset_plan.resolve_dataset(task_model, source_contexts, use=task_request['use'], variables=task_request['variables'], subsets=json.loads(subsets_json), runtime_lock_sha256=runtime_lock_sha256); json.dumps(execution_plan)",
        ),
      );
    }
    scope.postMessage({
      type: 'result',
      operation: request.operation,
      plan,
      source_plots:
        request.operation === 'import'
          ? Object.fromEntries([...sources].map(([record, { source }]) => [record, source.plots]))
          : undefined,
    });
  }

  return { review, taskForRequest };
}

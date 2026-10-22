export function createWorkerController({ scope, inspect, review, resume, run }) {
  let active = false;
  return async function handleMessage({ data }) {
    if (active) return;
    active = true;
    try {
      if (data.operation === 'inspect')
        scope.postMessage({ type: 'result', operation: 'inspect', runs: await inspect() });
      else if (data.operation === 'resume') await resume(data.job);
      else if (['review', 'import'].includes(data.operation)) await review(data);
      else await run(data);
    } catch (error) {
      scope.postMessage({ type: 'error', code: error.code, error: String(error.message || error) });
    } finally {
      active = false;
    }
  };
}

import { createRuntime } from './runtime.js';
import { createRunner } from './runner.js';
import { createIntake } from './staging.js';
import { createPlanReview } from './review.js';
import { createZipRuntime } from './export.js';
import { profileForSource } from './profiles.js';
import { preparePlot } from './prepare.js';
import { inspectRuns } from './run-store.js';

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

export function createPreparationController({
  scope,
  browser,
  cryptoProvider,
  runtime: providedRuntime,
  stagePlot: providedIntake,
  preparePlot: prepare = preparePlot,
  loadZip: providedZip,
  taskForRequest: providedTask,
}) {
  const base = new URL('../', scope.location.href);
  const nativeFetch = scope.fetch.bind(scope);
  const phase = (text) => scope.postMessage({ type: 'phase', text });
  const digest = async (bytes) =>
    [...new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', bytes))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  const runtime =
    providedRuntime || createRuntime({ scope, base, nativeFetch, digest, profileForSource, phase });
  const loadZip = providedZip || createZipRuntime({ scope, runtime });
  const { review, taskForRequest } = createPlanReview({ runtime, scope });
  const stagePlot = providedIntake || createIntake({ loadZip, nativeFetch, phase });
  const runner = createRunner({
    scope,
    browser,
    cryptoProvider,
    runtime,
    digest,
    phase,
    loadZip,
    stagePlot,
    preparePlot: prepare,
    taskForRequest: providedTask || taskForRequest,
  });
  const inspect = () => inspectRuns(browser);
  return {
    ...runner,
    review,
    inspect,
    onmessage: createWorkerController({ scope, inspect, review, ...runner }),
  };
}

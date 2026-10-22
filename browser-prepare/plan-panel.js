import { emptyDraft, readDraft, sameRequest } from './dataset-draft.js';
import { profileForPipeline } from './profiles.js';
export const planSources = (plan) => (plan.schema_version === '1.0.0' ? [plan] : plan.source_plans);
export const planRequest = (plan) =>
  plan.schema_version === '1.0.0'
    ? { use: plan.task_plan.use, variables: plan.task_plan.variables }
    : plan.request;

export function decodeImportedPlan(data, selection) {
  const { plan } = data,
    request = planRequest(plan),
    sources = planSources(plan);
  const normalized = selection.normalize(request.use, request.variables);
  if (!sameRequest(request, normalized))
    throw Error('Imported task requirements differ from this page. Reload and try again.');
  const draft = emptyDraft(request),
    memberships = new Map();
  for (const source of sources) {
    const task = source.task_plan,
      record = task.source_ref.replace(/^zenodo:/, '');
    const profile = profileForPipeline(task.pipeline_ref),
      result = selection.assess(record, request);
    if (
      !profile ||
      profile.recordId !== record ||
      result.status !== 'ready' ||
      result.pipeline_ref !== task.pipeline_ref
    )
      throw Error(`zenodo:${record}: imported source has no current browser implementation`);
    const nativePlots = Array.isArray(data.source_plots)
      ? data.source_plots
      : data.source_plots[record];
    const membership = nativePlots.map((plot) => ({
      ...plot,
      collection: profile.collectionOf(plot),
    }));
    memberships.set(
      record,
      membership.sort((a, b) => a.size_bytes - b.size_bytes),
    );
    const byPath = new Map(membership.map((plot) => [plot.path, plot]));
    draft.subsets.push(
      ...source.subsets.map((paths) => ({
        record_id: record,
        pipeline_ref: task.pipeline_ref,
        paths,
        collections: [...new Set(paths.map((path) => byPath.get(path).collection))],
        partitions: [...new Set(paths.map((path) => byPath.get(path).published_split))],
      })),
    );
  }
  readDraft(JSON.stringify(draft), selection.normalize);

  return { plan, request, sources, draft, memberships };
}

export function renderPlan(document, catalog, plan) {
  const $ = (id) => document.getElementById(id);
  const { totals } = plan,
    request = planRequest(plan),
    sources = planSources(plan);
  $('dataset-plan-summary').textContent =
    `${totals.plots} unique plots · ${totals.points.toLocaleString()} points · ${totals.overlapping_selections} overlapping selections retrieved once. Source LAS: ${(totals.source_las_bytes / 1048576).toFixed(1)} MiB; estimated browser space: ${Math.ceil(totals.estimated_browser_storage_bytes / 1048576)} MiB. Compressed network volume is not known.`;
  $('dataset-plan-requirements').textContent =
    `Use: ${request.use}. ` +
    sources
      .map((source) => {
        const task = source.task_plan;
        return `${catalog.datasets.find((d) => 'zenodo:' + d.id === task.source_ref)?.name || task.source_ref}: ${source.totals.plots} plots, ${source.totals.points.toLocaleString()} points; included ${Object.keys(task.included).join(', ')}; optional omissions ${Object.keys(task.omitted).join(', ') || 'none'}; folders ${source.output.partitions.join(', ')} / ${task.source_ref}.`;
      })
      .join(' ');
  $('dataset-plan-version').textContent =
    sources
      .map((source) => `${source.task_plan.source_ref}: ${source.task_plan.pipeline_ref}`)
      .join('; ') + `. Plan: ${plan.plan_sha256}.`;
  $('dataset-plan-evidence').textContent = JSON.stringify(plan, null, 2);
  const limitations = $('dataset-plan-limitations');
  limitations.replaceChildren();
  for (const text of plan.limitations) {
    const row = document.createElement('li');
    row.textContent = text;
    limitations.append(row);
  }
}

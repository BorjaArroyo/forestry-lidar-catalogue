/* Saved selections are a draft, not an execution/admission certificate. */
const levels = ['required', 'optional', 'off'];
export const emptyDraft = request => ({schema_version: '1.0.0', task_ref: 'task:instances', request: structuredClone(request), subsets: []});
export const sameRequest = (a, b) => a.use === b.use &&
  Object.keys(a.variables).length === Object.keys(b.variables).length &&
  Object.entries(a.variables).every(([key,value]) => b.variables[key] === value);

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw Error('Invalid saved selection structure');
}
function strings(values, nonempty = true) {
  if (!Array.isArray(values) || (nonempty && !values.length) || values.length > 10000 ||
      values.some(v => typeof v !== 'string' || !v || v.length > 2048) || new Set(values).size !== values.length)
    throw Error('Saved selections require unique, nonempty values');
}
export function readDraft(raw, normalize) {
  if (typeof raw !== 'string' || raw.length > 1024 * 1024) throw Error('Invalid saved selection size');
  const draft = JSON.parse(raw);
  exactKeys(draft, ['schema_version','task_ref','request','subsets']);
  if (draft.schema_version !== '1.0.0' || draft.task_ref !== 'task:instances' || !Array.isArray(draft.subsets) || draft.subsets.length > 50)
    throw Error('Unsupported saved selection');
  exactKeys(draft.request, ['use','variables']);
  if (!draft.request.variables || typeof draft.request.variables !== 'object' || Array.isArray(draft.request.variables) ||
      Object.values(draft.request.variables).some(value => !levels.includes(value))) throw Error('Invalid saved requirements');
  const normalized = normalize(draft.request.use, draft.request.variables);
  if (!sameRequest(draft.request, normalized)) throw Error('Saved task requirements are no longer current');
  for (const subset of draft.subsets) {
    exactKeys(subset, ['record_id','pipeline_ref','paths','collections','partitions']);
    if (!/^[1-9][0-9]*$/.test(subset.record_id) || typeof subset.pipeline_ref !== 'string' || !subset.pipeline_ref.startsWith('pipeline:'))
      throw Error('Invalid saved source or pipeline');
    for (const key of ['paths','collections','partitions']) strings(subset[key]);
  }
  return draft;
}
export function addSubset(draft, request, subset) {
  if (draft.subsets.length && !sameRequest(draft.request, request)) throw Error('Restore the saved requirements or clear the dataset before adding another subset');
  if (draft.subsets.length >= 50) throw Error('This draft supports up to 50 subsets');
  for (const key of ['paths','collections','partitions']) strings(subset[key]);
  if (draft.subsets.some(previous => previous.record_id === subset.record_id &&
      previous.pipeline_ref === subset.pipeline_ref && previous.paths.length === subset.paths.length &&
      previous.paths.every(path => subset.paths.includes(path)))) throw Error('This subset is already in your dataset');
  return {...emptyDraft(request), subsets: [...structuredClone(draft.subsets), structuredClone(subset)]};
}
export function reviewDraft(draft, {request, assess, sourcePlots, hasProfile}) {
  if (!draft.subsets.length) return {status: 'empty', paths: [], points: 0, bytes: 0, overlaps: 0};
  if (!sameRequest(draft.request, request)) throw Error('Requirements changed. Restore the saved requirements or clear this dataset');
  const records = new Set(draft.subsets.map(s => s.record_id));
  if (records.size !== 1) throw Error('This increment executes subsets from one admitted source at a time');
  const record = [...records][0], assessment = assess(record, draft.request);
  if (assessment.status !== 'ready' || !hasProfile(assessment.pipeline_ref)) throw Error('The saved source has no available audited preparation for these requirements');
  const plots = sourcePlots(record);
  if (!plots) throw Error('Loading the saved source membership…');
  const byPath = new Map(plots.map(plot => [plot.path, plot])), selected = new Map();
  let count = 0;
  for (const subset of draft.subsets) {
    if (subset.pipeline_ref !== assessment.pipeline_ref) throw Error('The saved pipeline changed. Clear and select the source again');
    for (const path of subset.paths) {
      const plot = byPath.get(path);
      if (!plot || !assessment.allowed_partitions.includes(plot.published_split)) throw Error('A saved plot is absent or excluded by the current task requirements');
      if (!subset.collections.includes(plot.collection) || !subset.partitions.includes(plot.published_split)) throw Error('Saved subset metadata differs from reviewed source membership');
      selected.set(path, plot); count++;
    }
  }
  return {status: 'ready', record_id: record, pipeline_ref: assessment.pipeline_ref, paths: [...selected.keys()],
    overlaps: count - selected.size, points: [...selected.values()].reduce((n,p) => n + p.points, 0),
    bytes: [...selected.values()].reduce((n,p) => n + p.size_bytes, 0), request: structuredClone(draft.request)};
}

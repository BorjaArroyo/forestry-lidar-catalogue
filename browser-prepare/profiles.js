import {fgiEmit} from './profiles/fgi-emit.js';
import {forInstance} from './profiles/for-instance.js';

// Closed implementation allowlist, not another catalog. Admission comes from the graph.
const profiles = [forInstance, fgiEmit];
export const profileForPipeline = id => profiles.find(profile => profile.pipelineRef === id);
export const profileForSource = (id, taskRef = 'task:instances') => {
  const ref = String(id).includes(':') ? String(id) : 'zenodo:' + id;
  return profiles.find(profile => profile.sourceRef === ref && profile.taskRef === taskRef);
};

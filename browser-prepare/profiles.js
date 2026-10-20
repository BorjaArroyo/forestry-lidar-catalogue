import {forInstance} from './profiles/for-instance.js';

// Closed implementation allowlist, not another catalog. Admission comes from the graph.
const profiles = [forInstance];
export const profileForPipeline = id => profiles.find(profile => profile.pipelineRef === id);
export const profileForSource = id => profiles.find(profile => profile.recordId === String(id));

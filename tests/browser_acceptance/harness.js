/* Acceptance-only orchestration. Production workers and scientific readers are unchanged. */
import {inspectRuns} from '../../browser-prepare/run-store.js';
const $ = id => document.getElementById(id);
const fixture = await fetch(new URL('./selection.json', import.meta.url)).then(r => r.json());
const key = 'canopy-browser-acceptance-job';
let worker, plan, output, job;
async function record(value) {
  $('events').textContent += JSON.stringify(value) + '\n';
  const response = await fetch('/acceptance/events', {method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...value, user_agent:navigator.userAgent})});
  if (!response.ok) throw Error('Could not save acceptance event');
}
function showResult(file, evidence) {
  if (evidence.report.points !== fixture.expected_points || evidence.report.chunks !== fixture.expected_blocks)
    throw Error('The completed run does not match the explicit acceptance selection');
  output = file;
  $('download').href = URL.createObjectURL(file); $('download').hidden = false; $('capture').disabled = false;
  $('status').textContent = `Validated ${evidence.report.points} points and ${evidence.report.chunks} blocks. ZIP ready.`;
}
function start(request, interrupt = false) {
  worker?.terminate();
  worker = new Worker(new URL('../../browser-prepare/worker.js', import.meta.url), {type:'module'});
  $('review').disabled = true; $('start').disabled = true;
  worker.onerror = event => { $('status').textContent = event.message; };
  worker.onmessage = ({data}) => {
    // Stop before awaiting logging; the test cannot race into another plot after its checkpoint.
    if (interrupt && data.type === 'checkpoint') {
      worker.terminate(); localStorage.setItem(key, data.job);
      $('status').textContent = 'Interrupted after a committed plot. Quit this test browser process, then relaunch this profile.';
    } else $('status').textContent = data.text || data.error || data.type;
    if (data.type === 'job') { job = data.id; localStorage.setItem(key, job); }
    const {file, ...event} = data;
    void record(event).catch(error => { $('status').textContent = error.message; });
    if (data.type === 'result' && data.operation === 'review') {
      plan = data.plan; $('start').disabled = false; worker.terminate();
    } else if (data.type === 'result') { showResult(file, data.evidence); worker.terminate(); }
    else if (data.type === 'error') { worker.terminate(); $('review').disabled = false; }
  };
  worker.postMessage(request);
}
$('review').onclick = () => start({operation:'review', mode:'zenodo', task_request:{use:fixture.use, variables:fixture.variables}, subsets:fixture.subsets});
$('start').onclick = () => start({mode:'zenodo', task_request:{use:fixture.use, variables:fixture.variables}, execution_plan:plan}, true);
$('recover').onclick = async () => {
  try {
    job = localStorage.getItem(key);
    const saved = (await inspectRuns()).find(run => run.id === job);
    if (!saved) throw Error('No acceptance run in this profile');
    await record({type:'discovery', job, status:saved.status, completed:saved.completed});
    if (saved.status === 'complete') showResult(saved.file, saved.evidence);
    else $('status').textContent = `Saved run ${job}: ${saved.completed} committed plots. Use Resume in Workbench.`;
  } catch (error) { $('status').textContent = error.message; }
};
$('capture').onclick = async () => {
  try {
    const response = await fetch('/acceptance/archive/' + job, {method:'POST', body:output});
    if (!response.ok) throw Error(await response.text());
    $('status').textContent = 'ZIP saved to the test server for native validation.';
  } catch (error) { $('status').textContent = error.message; }
};
if (localStorage.getItem(key)) await $('recover').onclick();
window.addEventListener('pagehide', () => worker?.terminate());


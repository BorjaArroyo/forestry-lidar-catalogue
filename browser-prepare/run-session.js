/* Each run owns its worker and watchdog. Stale callbacks cannot affect a successor. */
export class RunSession {
  constructor({event, failure, timeout = 180000, schedule = (fn, delay) => setTimeout(fn, delay), unschedule = id => clearTimeout(id)}) {
    Object.assign(this, {event, failure, timeout, schedule, unschedule});
    this.current = null;
  }
  get running() { return this.current !== null; }
  start(factory, request) {
    this.stop();
    const run = {worker: factory(), timer: null};
    this.current = run;
    const finish = () => {
      if (this.current !== run) return false;
      this.unschedule(run.timer);
      run.worker.terminate();
      this.current = null;
      return true;
    };
    const arm = () => {
      this.unschedule(run.timer);
      run.timer = this.schedule(() => {
        if (finish()) this.failure('Stopped after 180 seconds without progress. Temporary output can be cleared.');
      }, this.timeout);
    };
    run.worker.onmessage = ({data}) => {
      if (this.current !== run) return;
      if (['result', 'error'].includes(data.type)) finish(); else arm();
      this.event(data);
    };
    run.worker.onerror = error => {
      if (finish()) this.failure('Worker failed: ' + error.message);
    };
    try { arm(); run.worker.postMessage(request); }
    catch (error) { finish(); throw error; }
  }
  stop() {
    const run = this.current;
    if (!run) return;
    this.current = null;
    this.unschedule(run.timer);
    run.worker.terminate();
  }
}

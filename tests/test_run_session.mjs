import test from 'node:test';
import assert from 'node:assert/strict';
import { RunSession } from '../browser-prepare/run-session.js';
function fixture() {
  const timers = new Map(),
    workers = [],
    events = [],
    failures = [];
  let id = 0;
  const session = new RunSession({
    event: (data) => events.push(data),
    failure: (text) => failures.push(text),
    schedule: (callback) => {
      timers.set(++id, callback);
      return id;
    },
    unschedule: (key) => timers.delete(key),
  });
  const start = () =>
    session.start(() => {
      const worker = {
        terminate() {
          this.terminated = true;
        },
        postMessage() {},
      };
      workers.push(worker);
      return worker;
    }, {});
  return { session, start, timers, workers, events, failures };
}
test('worker failure clears its watchdog before the next run', () => {
  const f = fixture();
  f.start();
  const staleTimer = [...f.timers.values()][0];
  f.workers[0].onerror({ message: 'fixture' });
  assert.equal(f.timers.size, 0);
  assert.equal(f.session.running, false);
  f.start();
  staleTimer();
  assert.equal(f.workers[1].terminated, undefined);
  assert.equal(f.failures.length, 1);
});
test('cancellation and stale messages cannot change a successor', () => {
  const f = fixture();
  f.start();
  const old = f.workers[0];
  const staleTimer = [...f.timers.values()][0];
  f.session.stop();
  f.start();
  old.onmessage({ data: { type: 'result' } });
  old.onerror({ message: 'old' });
  staleTimer();
  assert.equal(f.events.length, 0);
  assert.equal(f.failures.length, 0);
  assert.equal(f.session.running, true);
  assert.equal(f.timers.size, 1);
});
test('success and reported failure both close the worker and timer', () => {
  for (const type of ['result', 'error']) {
    const f = fixture();
    f.start();
    f.workers[0].onmessage({ data: { type } });
    assert.equal(f.events[0].type, type);
    assert.equal(f.workers[0].terminated, true);
    assert.equal(f.timers.size, 0);
    assert.equal(f.session.running, false);
  }
});
test('progress replaces the watchdog; timeout closes only its own run', () => {
  const f = fixture();
  f.start();
  const old = [...f.timers.values()][0];
  f.workers[0].onmessage({ data: { type: 'phase' } });
  assert.equal(f.timers.size, 1);
  assert.notEqual([...f.timers.values()][0], old);
  [...f.timers.values()][0]();
  assert.equal(f.workers[0].terminated, true);
  assert.equal(f.failures.length, 1);
});
test('startup errors leave no active worker or watchdog', () => {
  const f = fixture();
  assert.throws(() =>
    f.session.start(
      () => ({
        terminate() {},
        postMessage() {
          throw Error('fixture');
        },
      }),
      {},
    ),
  );
  assert.equal(f.timers.size, 0);
  assert.equal(f.session.running, false);
});

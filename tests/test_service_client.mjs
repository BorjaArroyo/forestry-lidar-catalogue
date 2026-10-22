import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createServiceClient,
  ServiceConnectionError,
  ServiceResponseError,
} from '../web/workbench/client.js';

test('connection failures and service responses retain distinct diagnoses', async () => {
  const disconnected = createServiceClient({
    enabled: true,
    fetch: async () => {
      throw Error('offline');
    },
  });
  await assert.rejects(disconnected.request('/api/state'), ServiceConnectionError);
  for (const [status, response] of [
    [400, '{"error":"Invalid directory"}'],
    [500, '{"error":"Internal service error"}'],
    [200, 'null'],
    [200, '<html>error</html>'],
  ]) {
    const client = createServiceClient({
      enabled: true,
      fetch: async () => new Response(response, { status }),
    });
    await assert.rejects(
      client.request('/api/state'),
      (error) => error instanceof ServiceResponseError && error.status === status,
    );
  }
});

test('job submissions send the recovered session token', async () => {
  let sent;
  const client = createServiceClient({
    enabled: true,
    fetch: async (path, options) => {
      sent = { path, ...options };
      return Response.json({ id: 'fixture' }, { status: 202 });
    },
  });
  assert.deepEqual(await client.request('/api/jobs', { kind: 'acquire' }, 'fixture-token'), {
    id: 'fixture',
  });
  assert.equal(sent.headers['X-Canopy-Token'], 'fixture-token');
  assert.deepEqual(JSON.parse(sent.body), { kind: 'acquire' });
});

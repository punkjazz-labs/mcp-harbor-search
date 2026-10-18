import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { resetCache, tools } from '../src/worker.js';
import { TOOLS } from './fixtures.js';

beforeEach(() => resetCache());

test('tools() fetches the dataset once and caches it', async () => {
  let calls = 0;
  /** @type {typeof fetch} */
  const fake = async () => { calls += 1; return Response.json(TOOLS); };
  assert.equal((await tools(fake)).length, TOOLS.length);
  await tools(fake);
  assert.equal(calls, 1);
});

test('tools() surfaces dataset fetch failures', async () => {
  /** @type {typeof fetch} */
  const fake = async () => new Response('nope', { status: 503 });
  await assert.rejects(tools(fake), /HTTP 503/);
});

test('non-/mcp paths are 404 without touching the dataset', async () => {
  const res = await worker.fetch(new Request('https://example.com/'));
  assert.equal(res.status, 404);
});

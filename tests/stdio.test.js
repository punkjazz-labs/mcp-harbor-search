import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { forward, runStdio } from '../src/stdio.js';

/** @param {unknown[]} lines */
function stdinFrom(lines) {
  return Readable.from(lines.map((l) => `${typeof l === 'string' ? l : JSON.stringify(l)}\n`));
}

/** @returns {{ stream: Writable, text: () => string }} */
function captureStdout() {
  let buf = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += String(chunk);
      cb();
    },
  });
  return { stream, text: () => buf };
}

test('forward POSTs JSON-RPC with Streamable HTTP Accept and returns JSON', async () => {
  /** @type {{ url?: string, init?: RequestInit }} */
  const seen = {};
  /** @type {typeof fetch} */
  const fake = async (url, init) => {
    seen.url = String(url);
    seen.init = init;
    return Response.json({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'search_tools' }, { name: 'get_tool' }] } });
  };
  const out = /** @type {any} */ (await forward({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, fake));
  assert.equal(seen.url, 'https://mcpharbor.app/mcp');
  assert.equal(seen.init?.method, 'POST');
  const headers = /** @type {Record<string, string>} */ (seen.init?.headers);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Accept, 'application/json, text/event-stream');
  assert.deepEqual(out.result.tools.map((/** @type {{ name: string }} */ t) => t.name), ['search_tools', 'get_tool']);
});

test('forward returns null on 202 (notification ack)', async () => {
  /** @type {typeof fetch} */
  const fake = async () => new Response(null, { status: 202 });
  assert.equal(await forward({ jsonrpc: '2.0', method: 'notifications/initialized' }, fake), null);
});

test('runStdio initialize + tools/list writes newline-delimited responses', async () => {
  const responses = new Map([
    [1, { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'mcp-harbor-search' }, capabilities: { tools: {} } } }],
    [2, { jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'search_tools' }, { name: 'get_tool' }] } }],
  ]);
  /** @type {typeof fetch} */
  const fake = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const payload = responses.get(body.id);
    assert.ok(payload, `unexpected id ${body.id}`);
    return Response.json(payload);
  };
  const { stream, text } = captureStdout();
  await runStdio({
    stdin: stdinFrom([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]),
    stdout: stream,
    fetchImpl: fake,
  });
  const lines = text().trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].result.serverInfo.name, 'mcp-harbor-search');
  assert.deepEqual(lines[1].result.tools.map((/** @type {{ name: string }} */ t) => t.name), ['search_tools', 'get_tool']);
});

test('runStdio skips writing on notification 202 and surfaces upstream errors as JSON-RPC', async () => {
  /** @type {typeof fetch} */
  const fake = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return new Response('nope', { status: 503 });
  };
  const { stream, text } = captureStdout();
  await runStdio({
    stdin: stdinFrom([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 9, method: 'ping' },
    ]),
    stdout: stream,
    fetchImpl: fake,
  });
  const lines = text().trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].id, 9);
  assert.equal(lines[0].error.code, -32000);
  assert.match(lines[0].error.message, /HTTP 503/);
});

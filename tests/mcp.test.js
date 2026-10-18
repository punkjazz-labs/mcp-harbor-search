import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMcp, searchTools } from '../src/mcp.js';
import { TOOLS } from './fixtures.js';

/** @param {unknown} body @param {string} [method] */
const req = (body, method = 'POST') => new Request('https://mcpharbor.app/mcp', {
  method, headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
});
/** @param {unknown} body */
const call = async (body) => {
  const res = await handleMcp(req(body), TOOLS);
  return { res, json: res.status === 200 ? /** @type {any} */ (await res.json()) : null };
};

test('searchTools ranks by match strength then stars, requires every term', () => {
  const r = searchTools(TOOLS, { query: 'postgres' });
  assert.equal(r.total, 2);
  assert.equal(r.results[0].slug, 'postgres-mcp');
  assert.equal(r.results[0].listing, 'https://mcpharbor.app/tools/postgres-mcp/');
  assert.equal(searchTools(TOOLS, { query: 'postgres browser' }).total, 0);
});

test('searchTools filters by category and clamps limit to 1..50', () => {
  assert.deepEqual(searchTools(TOOLS, { query: '', category: 'databases' }).results.map((x) => x.slug).sort(), ['pg-lite', 'postgres-mcp']);
  assert.equal(searchTools(TOOLS, { query: '', limit: 1 }).results.length, 1);
  assert.equal(searchTools(TOOLS, { query: '', limit: 0 }).results.length, 4); // 0 -> default 10
  assert.equal(searchTools(TOOLS, { query: '', limit: '999' }).results.length, 4);
  assert.equal(searchTools(TOOLS, { query: '' }).results[0].slug, 'playwright-mcp'); // empty query: by stars
});

test('initialize negotiates protocol version', async () => {
  const { json } = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(json.result.protocolVersion, '2025-03-26');
  assert.equal(json.result.serverInfo.name, 'mcp-harbor-search');
  const { json: j2 } = await call({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.equal(j2.result.protocolVersion, '2025-06-18');
});

test('tools/list exposes read-only search_tools and get_tool', async () => {
  const { json } = await call({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.deepEqual(json.result.tools.map((/** @type {any} */ t) => t.name), ['search_tools', 'get_tool']);
  for (const t of json.result.tools) assert.equal(t.annotations.readOnlyHint, true);
});

test('tools/call search_tools and get_tool, with errors as isError results', async () => {
  const s = (await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_tools', arguments: { query: 'slack' } } })).json;
  assert.equal(s.result.isError, false);
  assert.equal(s.result.structuredContent.results[0].slug, 'slack-bot');
  assert.deepEqual(JSON.parse(s.result.content[0].text), s.result.structuredContent);
  const missing = (await call({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_tools', arguments: {} } })).json;
  assert.equal(missing.result.isError, true);
  const g = (await call({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_tool', arguments: { slug: 'pg-lite' } } })).json;
  assert.equal(g.result.structuredContent.name, 'pg-lite');
  const none = (await call({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_tool', arguments: { slug: 'nope' } } })).json;
  assert.equal(none.result.isError, true);
  const unknown = (await call({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'rm_rf' } })).json;
  assert.equal(unknown.error.code, -32602);
});

test('JSON-RPC errors: invalid request, unknown method, parse error', async () => {
  assert.equal((await call({ id: 1, method: 'ping' })).json.error.code, -32600);
  assert.equal((await call({ jsonrpc: '2.0', id: 1, method: 'nope' })).json.error.code, -32601);
  const bad = await handleMcp(req('{not json'), TOOLS);
  assert.equal(bad.status, 400);
  assert.equal((/** @type {any} */ (await bad.json())).error.code, -32700);
});

test('notifications get 202, batches return only responses', async () => {
  const n = await handleMcp(req({ jsonrpc: '2.0', method: 'notifications/initialized' }), TOOLS);
  assert.equal(n.status, 202);
  const { json } = await call([{ jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 7, method: 'ping' }]);
  assert.deepEqual(json, [{ jsonrpc: '2.0', id: 7, result: {} }]);
});

test('CORS preflight 204 and GET 405', async () => {
  const o = await handleMcp(req(null, 'OPTIONS'), TOOLS);
  assert.equal(o.status, 204);
  assert.equal(o.headers.get('access-control-allow-origin'), '*');
  const g = await handleMcp(req(null, 'GET'), TOOLS);
  assert.equal(g.status, 405);
  assert.equal(g.headers.get('allow'), 'POST, OPTIONS');
});

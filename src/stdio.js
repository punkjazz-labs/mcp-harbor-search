#!/usr/bin/env node
// Thin stdio MCP proxy: newline-delimited JSON-RPC on stdin/stdout, forwarded to the
// public Streamable HTTP endpoint so clients get the same tools without a local dataset.
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'https://mcpharbor.app/mcp';
const ACCEPT = 'application/json, text/event-stream';

/**
 * POST one JSON-RPC message (or batch) to the remote Streamable HTTP MCP endpoint.
 * Returns the parsed JSON body, or null when the remote acknowledges a notification (202).
 * @param {unknown} message
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [url]
 * @returns {Promise<unknown | null>}
 */
export async function forward(message, fetchImpl = fetch, url = DEFAULT_URL) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: ACCEPT },
    body: JSON.stringify(message),
  });
  if (res.status === 202) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`upstream HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/event-stream')) return parseSseJson(await res.text());
  return res.json();
}

/**
 * Best-effort: take the last JSON `data:` payload from an SSE body (Streamable HTTP).
 * @param {string} body
 */
function parseSseJson(body) {
  let last = null;
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    last = JSON.parse(raw);
  }
  if (last === null) throw new Error('empty SSE response from upstream');
  return last;
}

/**
 * Read newline-delimited JSON-RPC from stdin, forward each line, write responses to stdout.
 * Injectable streams/fetch for tests. Never writes non-protocol text to stdout.
 * @param {{ stdin?: NodeJS.ReadableStream, stdout?: NodeJS.WritableStream, fetchImpl?: typeof fetch, url?: string }} [opts]
 */
export async function runStdio(opts = {}) {
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = opts.url ?? DEFAULT_URL;
  const rl = createInterface({ input: stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    /** @type {unknown} */
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      continue;
    }
    try {
      const out = await forward(msg, fetchImpl, url);
      if (out !== null && out !== undefined) stdout.write(`${JSON.stringify(out)}\n`);
    } catch (e) {
      const id = msg && typeof msg === 'object' && 'id' in msg ? /** @type {{ id?: unknown }} */ (msg).id ?? null : null;
      const message = e instanceof Error ? e.message : String(e);
      stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message } })}\n`);
    }
  }
}

const entry = process.argv[1] && pathToFileURL(process.argv[1]).href;
if (entry && import.meta.url === entry) {
  runStdio().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

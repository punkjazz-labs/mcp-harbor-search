// Standalone Worker: serves mcp-harbor-search at /mcp using the public MCP Harbor dataset.
import { handleMcp } from './mcp.js';

/** @typedef {import('./mcp.js').Entry} Entry */

const DATA_URL = 'https://raw.githubusercontent.com/punkjazz-labs/agent-tools-directory/main/data/tools.json';
const TTL_MS = 3600e3;
/** @type {Entry[] | undefined} */
let cache;
let at = 0;

/**
 * Load the dataset, cached in memory for an hour. `fetchImpl` is injectable for tests.
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Entry[]>}
 */
export async function tools(fetchImpl = fetch) {
  if (!cache || Date.now() - at > TTL_MS) {
    const res = await fetchImpl(DATA_URL);
    if (!res.ok) throw new Error(`dataset fetch failed: HTTP ${res.status}`);
    cache = /** @type {Entry[]} */ (await res.json());
    at = Date.now();
  }
  return cache;
}

/** Test hook: forget the cached dataset. */
export function resetCache() {
  cache = undefined;
  at = 0;
}

export default {
  /** @param {Request} req */
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/mcp') return handleMcp(req, await tools());
    return new Response('mcp-harbor-search: POST /mcp', { status: 404 });
  },
};

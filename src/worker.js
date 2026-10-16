// Standalone Worker: serves mcp-harbor-search at /mcp using the public MCP Harbor dataset.
import { handleMcp } from './mcp.js';
const DATA_URL = 'https://raw.githubusercontent.com/punkjazz-labs/agent-tools-directory/main/data/tools.json';
let cache, at = 0;
async function tools() {
  if (!cache || Date.now() - at > 3600e3) { cache = await (await fetch(DATA_URL)).json(); at = Date.now(); }
  return cache;
}
export default {
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/mcp') return handleMcp(req, await tools());
    return new Response('mcp-harbor-search: POST /mcp', { status: 404 });
  },
};

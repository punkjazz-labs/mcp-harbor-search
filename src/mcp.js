// mcp-harbor-search: minimal remote MCP server (Streamable HTTP, JSON responses, stateless).
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SITE = 'https://mcpharbor.app';
const TOOLS = [
  { name: 'search_tools', title: 'Search MCP Harbor',
    description: 'Search the MCP Harbor directory of MCP servers and AI-agent tools by keyword, optionally filtered by category. Returns the best matches ranked by relevance and GitHub stars.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Keywords, e.g. "postgres", "browser automation", "slack"' },
      category: { type: 'string', description: 'Optional category slug: search-web, ai-agent-frameworks, cloud-infra, browser-automation, databases, memory-knowledge, productivity, developer-tools, finance-crypto, media-design, other' },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 } }, required: ['query'] },
    annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: 'get_tool', title: 'Get MCP Harbor listing',
    description: 'Get the full MCP Harbor listing for one tool by its slug (as returned by search_tools).',
    inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
    annotations: { readOnlyHint: true, openWorldHint: false } },
];
const brief = t => ({ slug: t.slug, name: t.name, description: t.description, category: t.category, type: t.type,
  stars: t.stars, url: t.url, listing: `${SITE}/tools/${t.slug}/` });

export function searchTools(tools, { query = '', category, limit = 10 }) {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  limit = Math.min(Math.max(parseInt(limit) || 10, 1), 50);
  const scored = [];
  for (const t of tools) {
    if (category && t.category !== category) continue;
    const name = (t.name || '').toLowerCase(), slug = (t.slug || '').toLowerCase();
    const desc = (t.description || '').toLowerCase(), topics = (t.topics || []).join(' ').toLowerCase();
    let s = 0, all = true;
    for (const w of terms) {
      let m = 0;
      if (name === w) m += 10; else if (name.includes(w)) m += 6;
      if (slug.includes(w)) m += 3; if (topics.includes(w)) m += 3; if (desc.includes(w)) m += 2;
      if (!m) all = false; s += m;
    }
    if (terms.length && !all) continue;
    scored.push([s + Math.log10((t.stars || 0) + 1), t]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return { total: scored.length, results: scored.slice(0, limit).map(x => brief(x[1])) };
}

const rpc = (id, result) => ({ jsonrpc: '2.0', id, result });
const err = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const text = (obj, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj, isError });

function handle(msg, tools) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(msg?.id, -32600, 'Invalid Request');
  const { id, method, params = {} } = msg;
  if (id === undefined) return null; // notification
  switch (method) {
    case 'initialize': return rpc(id, {
      protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'mcp-harbor-search', title: 'MCP Harbor Search', version: '1.0.0', websiteUrl: SITE },
      instructions: 'Search the MCP Harbor directory (mcpharbor.app) of MCP servers and AI-agent tools.' });
    case 'ping': return rpc(id, {});
    case 'tools/list': return rpc(id, { tools: TOOLS });
    case 'tools/call': {
      const a = params.arguments || {};
      if (params.name === 'search_tools') {
        if (!a.query || typeof a.query !== 'string') return rpc(id, text({ error: 'query (string) is required' }, true));
        return rpc(id, text(searchTools(tools, a)));
      }
      if (params.name === 'get_tool') {
        const t = tools.find(x => x.slug === a.slug);
        return rpc(id, t ? text({ ...t, listing: `${SITE}/tools/${t.slug}/` }) : text({ error: `No tool with slug "${a.slug}"` }, true));
      }
      return err(id, -32602, `Unknown tool: ${params.name}`);
    }
    default: return err(id, -32601, `Method not found: ${method}`);
  }
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id' };

export async function handleMcp(request, tools) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return new Response(JSON.stringify(err(null, -32000, 'Use POST (Streamable HTTP). SSE streams are not offered.')),
    { status: 405, headers: { ...CORS, Allow: 'POST, OPTIONS', 'Content-Type': 'application/json' } });
  let body; try { body = await request.json(); } catch { return Response.json(err(null, -32700, 'Parse error'), { status: 400, headers: CORS }); }
  const out = Array.isArray(body) ? body.map(m => handle(m, tools)).filter(Boolean) : handle(body, tools);
  if (out === null || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202, headers: CORS });
  return Response.json(out, { headers: CORS });
}

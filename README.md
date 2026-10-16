# mcp-harbor-search

A public, remote [MCP](https://modelcontextprotocol.io) server that lets AI agents search the [MCP Harbor](https://mcpharbor.app) directory of 1,400+ MCP servers and AI-agent tools.

**Endpoint:** `https://mcpharbor.app/mcp` (Streamable HTTP, no auth, read-only)

## Tools
| Tool | Arguments | Returns |
|---|---|---|
| `search_tools` | `query` (string), `category`? (slug), `limit`? (1-50, default 10) | Ranked matches: slug, name, description, category, stars, URL, listing link |
| `get_tool` | `slug` (string) | Full listing for one tool |

Categories: `search-web`, `ai-agent-frameworks`, `cloud-infra`, `browser-automation`, `databases`, `memory-knowledge`, `productivity`, `developer-tools`, `finance-crypto`, `media-design`, `other`.

## Connect
Any client that supports remote MCP servers:
```json
{ "mcpServers": { "mcp-harbor": { "url": "https://mcpharbor.app/mcp" } } }
```
For stdio-only clients, use a bridge such as `mcp-remote`: `{"command":"npx","args":["mcp-remote","https://mcpharbor.app/mcp"]}`.

## Try it with curl
```sh
curl -s https://mcpharbor.app/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_tools","arguments":{"query":"postgres"}}}'
```

## Self-host
No dependencies and no build step. `src/mcp.js` is the protocol and search logic. `src/worker.js` is a Cloudflare Worker that loads the public dataset from the `punkjazz-labs/agent-tools-directory` repo.
```sh
npx wrangler deploy
```

## License
MIT © Punkjazz Labs

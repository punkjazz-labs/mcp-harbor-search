# Stdio MCP proxy for mcp-harbor-search (Glama / local Docker).
# No secrets, no build step, no runtime npm deps — forwards to https://mcpharbor.app/mcp.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
USER node
CMD ["node", "src/stdio.js"]

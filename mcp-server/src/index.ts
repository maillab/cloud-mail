#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { CloudMailClient } from './client.js';
import {
  listEmailsTool,
  latestEmailsTool,
  searchAllEmailsTool,
  getAttachmentsTool,
  sendEmailTool,
  markReadTool,
  listAccountsTool,
} from './tools.js';

const client = new CloudMailClient(config.cloudMailUrl, config.cloudMailUser, config.cloudMailPassword);

const server = new McpServer({ name: 'cloud-mail', version: '0.1.0' });

// Wraps a REST-calling handler (which just returns data or throws) into the
// MCP tool-callback shape. Generic only over the plain args type `A` — not
// over the zod raw shape — so each `server.tool(...)` call below stays a
// concrete, non-generic call site and TypeScript can fully resolve the SDK's
// conditional callback types.
function wrapHandler<A>(handler: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult> {
  return async (args) => {
    try {
      const result = await handler(args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  };
}

server.tool(
  listEmailsTool.name,
  listEmailsTool.description,
  listEmailsTool.schema,
  wrapHandler((args) => listEmailsTool.handler(client, args))
);
server.tool(
  latestEmailsTool.name,
  latestEmailsTool.description,
  latestEmailsTool.schema,
  wrapHandler((args) => latestEmailsTool.handler(client, args))
);
server.tool(
  searchAllEmailsTool.name,
  searchAllEmailsTool.description,
  searchAllEmailsTool.schema,
  wrapHandler((args) => searchAllEmailsTool.handler(client, args))
);
server.tool(
  getAttachmentsTool.name,
  getAttachmentsTool.description,
  getAttachmentsTool.schema,
  wrapHandler((args) => getAttachmentsTool.handler(client, args))
);
server.tool(
  sendEmailTool.name,
  sendEmailTool.description,
  sendEmailTool.schema,
  wrapHandler((args) => sendEmailTool.handler(client, args))
);
server.tool(
  markReadTool.name,
  markReadTool.description,
  markReadTool.schema,
  wrapHandler((args) => markReadTool.handler(client, args))
);
server.tool(
  listAccountsTool.name,
  listAccountsTool.description,
  listAccountsTool.schema,
  wrapHandler((args) => listAccountsTool.handler(client, args))
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('cloud-mail MCP server running on stdio');
}

main().catch((e) => {
  console.error('Fatal error starting cloud-mail MCP server:', e);
  process.exit(1);
});

// Tiny MCP server used by the tests: one read-only tool and one tool with side effects.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const notes = [];
const server = new McpServer({ name: 'notes', version: '1.0.0' });
server.registerTool('search_notes', {
  description: 'Search saved notes',
  inputSchema: { query: z.string() },
  annotations: { readOnlyHint: true },
}, async ({ query }) => ({ content: [{ type: 'text', text: `found ${notes.filter((n) => n.includes(query)).length} notes for "${query}"` }] }));
server.registerTool('create_note', {
  description: 'Create a note',
  inputSchema: { text: z.string() },
}, async ({ text }) => { notes.push(text); return { content: [{ type: 'text', text: `saved note #${notes.length}: ${text}` }] }; });
await server.connect(new StdioServerTransport());

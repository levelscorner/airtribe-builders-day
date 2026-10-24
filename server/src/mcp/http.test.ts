import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import express from "express";
import type { ApiHealth } from "../health.js";
import { warnIfMcpOpen } from "./auth.js";
import { createMcpRouter } from "./http.js";

const health: ApiHealth = { ok: true, mock: true, memory: true, llm: "mock", payments: "qr" };
const KEY = "test-mcp-key";

function textOf(content: unknown): string {
  assert.ok(Array.isArray(content));
  const block = content[0] as { type?: string; text?: string };
  assert.equal(block?.type, "text");
  assert.equal(typeof block.text, "string");
  return block.text ?? "";
}

function appWith(env: Record<string, string | undefined>) {
  const app = express();
  app.use(express.json());
  app.use(
    "/mcp",
    createMcpRouter({
      env,
      health: () => health,
      createBrief: async () => ({ id: "job-1", chatId: "chat-1", stage: "brief" }),
      jobStatus: async () => null,
    }),
  );
  return app;
}

function listen(app: ReturnType<typeof express>): Promise<Server> {
  const server = createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function portOf(server: Server): number {
  const address = server.address() as AddressInfo;
  return address.port;
}

test("a missing or wrong MCP key is rejected and a matching key is accepted", async () => {
  const server = await listen(appWith({ MCP_API_KEY: KEY }));
  try {
    const base = `http://127.0.0.1:${portOf(server)}/mcp`;
    const missing = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: "{}",
    });
    assert.equal(missing.status, 401);
    const wrong = await fetch(base, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-api-key": "not-the-key",
      },
      body: "{}",
    });
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.text()).includes(KEY), false);

    const query = await fetch(`${base}?key=${encodeURIComponent(KEY)}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.notEqual(query.status, 401);

    const client = new Client({ name: "chotu-test", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(base), {
      requestInit: { headers: { "X-API-Key": KEY } },
    });
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      ["chotu_create_video_brief", "chotu_get_job_status", "chotu_health", "chotu_list_genres"],
    );
    const called = await client.callTool({ name: "chotu_health", arguments: {} });
    assert.deepEqual(JSON.parse(textOf(called.content)), health);
    await client.close();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("an unset MCP key leaves the connector open and warns once", async () => {
  const notes: string[] = [];
  warnIfMcpOpen({ MCP_API_KEY: KEY }, (message) => notes.push(message));
  warnIfMcpOpen({}, (message) => notes.push(message));
  warnIfMcpOpen({}, (message) => notes.push(message));
  assert.deepEqual(notes, ["MCP_API_KEY is unset; /mcp is open"]);
  assert.equal(notes.join("").includes(KEY), false);

  const server = await listen(appWith({}));
  try {
    const client = new Client({ name: "chotu-open", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${portOf(server)}/mcp`));
    await client.connect(transport);
    const called = await client.callTool({ name: "chotu_health", arguments: {} });
    assert.deepEqual(JSON.parse(textOf(called.content)), health);
    await client.close();
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

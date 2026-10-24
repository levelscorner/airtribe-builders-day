import { env } from "../env.js";
import {
  connectMcp,
  discoverTools,
  type DiscoveredTools,
  type McpTransportKind,
} from "./client.js";

export type McpServerId = "higgsfield" | "openart" | "elevenlabs";

export interface McpServerState {
  id: McpServerId;
  url: string;
  tools: DiscoveredTools;
  toolNames: string[];
  client: { close: () => Promise<void> };
}

const servers = new Map<McpServerId, McpServerState>();
let started = false;

async function tryConnect(
  id: McpServerId,
  url: string | undefined,
  token: string | undefined,
  transport: McpTransportKind,
): Promise<McpServerState | null> {
  if (!url) {
    console.log(`[mcp] ${id}: skipped (no URL)`);
    return null;
  }
  try {
    const client = await connectMcp({ name: id, url, token, transport });
    const tools = await discoverTools(client);
    const toolNames = Object.keys(tools).sort();
    console.log(`[mcp] ${id}: connected (${toolNames.length} tools) → ${toolNames.join(", ") || "(none)"}`);
    const state: McpServerState = { id, url, tools, toolNames, client };
    servers.set(id, state);
    return state;
  } catch (err) {
    console.warn(`[mcp] ${id}: connect failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Discover MCP tools at process startup (skipped entirely in mock mode).
 */
export async function startMcpRegistry(): Promise<void> {
  if (started) return;
  started = true;

  if (env.mockMode) {
    console.log("[mcp] MOCK_MODE — skipping MCP connections");
    return;
  }

  await Promise.all([
    tryConnect("higgsfield", env.higgsfieldMcpUrl, env.higgsfieldMcpToken, env.higgsfieldMcpTransport),
    tryConnect("openart", env.openartMcpUrl, env.openartMcpToken, env.openartMcpTransport),
    tryConnect("elevenlabs", env.elevenlabsMcpUrl, env.elevenlabsApiKey, env.elevenlabsMcpTransport),
  ]);
}

export function getMcpServer(id: McpServerId): McpServerState | undefined {
  return servers.get(id);
}

export function mcpRegistrySnapshot() {
  return {
    mockMode: env.mockMode,
    servers: Object.fromEntries(
      [...servers.entries()].map(([id, s]) => [
        id,
        { url: s.url, tools: s.toolNames },
      ]),
    ),
  };
}

export async function stopMcpRegistry(): Promise<void> {
  for (const s of servers.values()) {
    try {
      await s.client.close();
    } catch {
      /* ignore */
    }
  }
  servers.clear();
  started = false;
}

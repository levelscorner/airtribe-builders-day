import { experimental_createMCPClient } from "ai";

type McpClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;

export type McpTransportKind = "http" | "sse";

export interface McpConnectionConfig {
  name: string;
  url: string;
  /** Bearer token (or raw Authorization value if it already includes a scheme). */
  token?: string;
  transport: McpTransportKind;
  headers?: Record<string, string>;
}

/**
 * Create an AI SDK MCP client.
 * Prefer @ai-sdk/mcp (HTTP + SSE); fall back to `ai` experimental client (SSE-typed).
 */
export async function connectMcp(cfg: McpConnectionConfig): Promise<McpClient> {
  const headers: Record<string, string> = { ...(cfg.headers ?? {}) };
  if (cfg.token) {
    headers.Authorization = cfg.token.includes(" ") ? cfg.token : `Bearer ${cfg.token}`;
  }

  try {
    const mod = (await import("@ai-sdk/mcp")) as unknown as {
      createMCPClient?: (c: unknown) => Promise<unknown>;
      experimental_createMCPClient?: (c: unknown) => Promise<unknown>;
    };
    const create = mod.createMCPClient ?? mod.experimental_createMCPClient;
    if (create) {
      return (await create({
        name: `chotu-mini-${cfg.name}`,
        transport: {
          type: cfg.transport,
          url: cfg.url,
          headers,
        },
      })) as McpClient;
    }
  } catch (err) {
    if (cfg.transport === "http") {
      console.warn(
        `[mcp:${cfg.name}] @ai-sdk/mcp HTTP connect path failed (${err instanceof Error ? err.message : err}); trying ai SSE client`,
      );
    }
  }

  return experimental_createMCPClient({
    name: `chotu-mini-${cfg.name}`,
    transport: {
      type: "sse",
      url: cfg.url,
      headers,
    },
  });
}

export type DiscoveredTools = Record<
  string,
  {
    execute: (
      args: unknown,
      options?: { toolCallId?: string; messages?: unknown[]; abortSignal?: AbortSignal },
    ) => PromiseLike<unknown>;
  }
>;

export async function discoverTools(client: McpClient): Promise<DiscoveredTools> {
  return (await client.tools()) as DiscoveredTools;
}

export function pickTool(
  tools: DiscoveredTools,
  configuredName: string,
  aliases: string[] = [],
): { name: string; tool: DiscoveredTools[string] } | undefined {
  const names = Object.keys(tools);
  const want = [configuredName, ...aliases].map((s) => s.toLowerCase());

  for (const w of want) {
    const exact = names.find((n) => n.toLowerCase() === w);
    if (exact) return { name: exact, tool: tools[exact]! };
  }
  for (const w of want) {
    const partial = names.find((n) => n.toLowerCase().includes(w) || w.includes(n.toLowerCase()));
    if (partial) return { name: partial, tool: tools[partial]! };
  }
  return undefined;
}

export async function callMcpTool(
  tools: DiscoveredTools,
  toolName: string,
  args: Record<string, unknown>,
  aliases: string[] = [],
): Promise<{ toolName: string; result: unknown }> {
  const picked = pickTool(tools, toolName, aliases);
  if (!picked) {
    throw new Error(
      `MCP tool "${toolName}" not found. Available: ${Object.keys(tools).sort().join(", ") || "(none)"}`,
    );
  }
  const result = await picked.tool.execute(args, {
    toolCallId: `chotu-${Date.now()}`,
    messages: [],
  });
  return { toolName: picked.name, result };
}

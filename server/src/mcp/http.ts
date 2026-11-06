import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ApiHealth } from "../health.js";
import type { EnvLike } from "../media/flags.js";
import { mcpAuthorized } from "./auth.js";
import { createVideoBrief, getJobStatus, listGenres } from "./jobs.js";

type BriefInput = Parameters<typeof createVideoBrief>[1];
type JobStatus = NonNullable<Awaited<ReturnType<typeof getJobStatus>>>;

export interface McpDeps {
  health: () => ApiHealth;
  createBrief: (input: BriefInput) => Promise<{ id: string; chatId: string; stage: string }>;
  jobStatus: (jobId: string) => Promise<JobStatus | null>;
  env?: EnvLike;
}

function jsonText(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function toolError(error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  const message = error instanceof Error ? error.message : "tool failed";
  return { isError: true, content: [{ type: "text", text: message.slice(0, 300) }] };
}

function registerTools(server: McpServer, deps: McpDeps): void {
  server.tool("chotu_health", "Same JSON as GET /api/health.", async () => jsonText(deps.health()));
  server.tool("chotu_list_genres", "List the studio genres from the genre configs.", async () =>
    jsonText({ genres: listGenres() }),
  );
  server.tool(
    "chotu_create_video_brief",
    "Start a chat job from an idea, genre, and language. Returns the job id.",
    {
      idea: z.string().min(1),
      genre: z.enum(["kids", "ad", "faceless"]),
      language: z.enum(["hi", "hinglish", "en"]),
    },
    async (args) => {
      try {
        return jsonText(await deps.createBrief(args));
      } catch (error) {
        return toolError(error);
      }
    },
  );
  server.tool(
    "chotu_get_job_status",
    "Current stage and artefact URLs for a job id (video id or chat id).",
    { job_id: z.string().min(1) },
    async (args) => {
      try {
        const status = await deps.jobStatus(args.job_id);
        if (!status) return toolError(new Error("job not found"));
        return jsonText(status);
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

async function handleMcp(req: Request, res: Response, deps: McpDeps): Promise<void> {
  const server = new McpServer({ name: "chotu-studio", version: "0.1.0" });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    registerTools(server, deps);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

/** Stateless Streamable HTTP at POST/GET `/mcp`. */
export function createMcpRouter(deps: McpDeps): Router {
  const router = Router();
  router.use((req, res, next) => {
    if (mcpAuthorized(req, deps.env ?? process.env)) {
      next();
      return;
    }
    res.status(401).json({ error: "unauthorized" });
  });
  router.post("/", (req, res) => {
    void handleMcp(req, res, deps);
  });
  router.get("/", (req, res) => {
    void handleMcp(req, res, deps);
  });
  return router;
}

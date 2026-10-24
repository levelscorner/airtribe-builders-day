import { assembleWithFfmpeg, type AssembleOptions } from "./ffmpeg.js";
import type { Renderer, RendererInput, RendererOutput } from "./types.js";

const RENDER_API = "https://api.render.com/v1/task-runs";
const RUNNING = new Set(["queued", "pending", "running", "created", "waiting"]);

export interface WorkflowOptions extends AssembleOptions {
  apiKey: string;
  task?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  pollMs?: number;
}

/**
 * Prefer a Render Workflow task (`chotu-render/assemble` by default).
 * Any failure — missing key is handled by the factory — falls back to local
 * ffmpeg, which is the Replit path.
 */
export function createWorkflowRenderer(options: WorkflowOptions): Renderer {
  const task = options.task ?? "chotu-render/assemble";
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollMs = options.pollMs ?? 1000;

  return {
    async render(input: RendererInput): Promise<RendererOutput> {
      try {
        const remote = await runWorkflow(input, { task, apiKey: options.apiKey, fetchImpl, timeoutMs, pollMs });
        if (remote) return remote;
      } catch (error) {
        console.warn(`Render workflow failed, using local ffmpeg: ${error instanceof Error ? error.message : error}`);
      }
      return assembleWithFfmpeg(input, options);
    },
  };
}

async function runWorkflow(
  input: RendererInput,
  options: {
    task: string;
    apiKey: string;
    fetchImpl: typeof fetch;
    timeoutMs: number;
    pollMs: number;
  },
): Promise<RendererOutput | null> {
  const started = await options.fetchImpl(RENDER_API, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      task: options.task,
      input: [input],
      idempotencyKey: input.videoId,
    }),
  });
  if (!started.ok) return null;
  let body: unknown = await started.json();
  const deadline = Date.now() + options.timeoutMs;
  let parsed = readRun(body);
  while (parsed.status && RUNNING.has(parsed.status) && parsed.id && Date.now() < deadline) {
    await delay(options.pollMs);
    const polled = await options.fetchImpl(`${RENDER_API}/${encodeURIComponent(parsed.id)}`, {
      headers: { authorization: `Bearer ${options.apiKey}` },
    });
    if (!polled.ok) return null;
    body = await polled.json();
    parsed = readRun(body);
  }
  if (!parsed.output) return null;
  if (parsed.status && RUNNING.has(parsed.status)) return null;
  return {
    url: parsed.output.url,
    durationMs: parsed.output.durationMs,
    provider: "render_workflow",
  };
}

function readRun(body: unknown): {
  id?: string;
  status?: string;
  output?: { url: string; durationMs: number };
} {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const nested =
    record.taskRun && typeof record.taskRun === "object"
      ? (record.taskRun as Record<string, unknown>)
      : record;
  const id = typeof nested.id === "string" ? nested.id : undefined;
  const status = typeof nested.status === "string" ? nested.status.toLowerCase() : undefined;
  const results = nested.results ?? nested.result;
  const first = Array.isArray(results) ? results[0] : results;
  if (!first || typeof first !== "object") return { id, status };
  const output = first as Record<string, unknown>;
  const url = typeof output.url === "string" ? output.url : "";
  const durationMs = typeof output.durationMs === "number" ? output.durationMs : 0;
  if (!url) return { id, status };
  return { id, status, output: { url, durationMs } };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Function a Render Workflow task should call. Register the slug
 * `chotu-render/assemble` (or `RENDER_WORKFLOW_TASK`). Input is one
 * RendererInput. The web process triggers it with POST /v1/task-runs.
 */
export async function assemble(input: RendererInput): Promise<RendererOutput> {
  return assembleWithFfmpeg(input, {
    workDir: process.env.RENDER_WORK_DIR || "/tmp/chotu-renders",
    publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:8787",
  });
}

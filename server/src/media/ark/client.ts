import type { EnvLike } from "../flags.js";
import { ARK_API_BASE } from "./request.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ArkDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}

const TERMINAL = new Set(["succeeded", "failed", "expired", "cancelled", "canceled"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutMs(env: EnvLike): number {
  const parsed = Number(env.ARK_POLL_TIMEOUT_MS ?? "180000");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 180_000;
}

function scrub(message: string, secret: string): string {
  return secret ? message.split(secret).join("[redacted]") : message;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function errorText(payload: Record<string, unknown>, status: number): string {
  const error = payload.error;
  if (typeof error === "object" && error !== null) {
    const row = error as Record<string, unknown>;
    const message = typeof row.message === "string" ? row.message : "";
    const code = typeof row.code === "string" ? row.code : "";
    const combined = [code, message].filter(Boolean).join(": ");
    if (combined) return combined.slice(0, 300);
  }
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim().slice(0, 300);
  return `request failed (${status})`;
}

export class ArkClient {
  private readonly fetch: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly key: string;
  private readonly base: string;
  private readonly timeout: number;

  constructor(env: EnvLike, deps: ArkDeps = {}) {
    this.fetch = deps.fetch ?? fetch;
    this.sleep = deps.sleep ?? sleep;
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.key = env.ARK_API_KEY?.trim() ?? "";
    this.base = (env.ARK_API_BASE?.trim() || ARK_API_BASE).replace(/\/$/, "");
    this.timeout = timeoutMs(env);
  }

  async image(body: Record<string, unknown>): Promise<string> {
    const payload = await this.post("/images/generations", body);
    const data = Array.isArray(payload.data) ? payload.data[0] : undefined;
    const row = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : payload;
    const url = typeof row.url === "string" ? row.url : "";
    if (!url) throw new Error("ark image result missing url");
    return url;
  }

  async video(body: Record<string, unknown>): Promise<string> {
    const created = await this.post("/contents/generations/tasks", body);
    let task = readTask(created);
    const started = this.now();
    let delay = 8000;
    while (!TERMINAL.has(task.status)) {
      if (this.now() - started > this.timeout) throw new Error("ark poll timed out");
      await this.sleep(delay + Math.floor(this.random() * 200));
      task = readTask(await this.get(`/contents/generations/tasks/${encodeURIComponent(task.id)}`));
      delay = Math.min(Math.round(delay * 1.5), 10_000);
    }
    if (task.status === "cancelled" || task.status === "canceled") {
      throw new Error(task.error || "ark video canceled");
    }
    if (task.status !== "succeeded" || !task.videoUrl) {
      throw new Error(task.error || "ark video failed");
    }
    return task.videoUrl;
  }

  private async post(path: string, body: Record<string, unknown>, attempt = 0): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetch(`${this.base}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (attempt < 1) return this.post(path, body, attempt + 1);
      throw new Error(scrub(error instanceof Error ? error.message : "ark request failed", this.key));
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await response.arrayBuffer().catch(() => undefined);
      await this.sleep(200 * (attempt + 1));
      return this.post(path, body, attempt + 1);
    }
    const payload = await readJson(response);
    if (!response.ok) throw new Error(scrub(`ark ${response.status}: ${errorText(payload, response.status)}`, this.key));
    return payload;
  }

  private async get(path: string, attempt = 0): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetch(`${this.base}${path}`, { headers: { Authorization: `Bearer ${this.key}` } });
    } catch (error) {
      if (attempt < 2) {
        await this.sleep(200 * (attempt + 1));
        return this.get(path, attempt + 1);
      }
      throw new Error(scrub(error instanceof Error ? error.message : "ark request failed", this.key));
    }
    if (response.status >= 500 && attempt < 2) {
      await response.arrayBuffer().catch(() => undefined);
      await this.sleep(200 * (attempt + 1));
      return this.get(path, attempt + 1);
    }
    const payload = await readJson(response);
    if (!response.ok) throw new Error(scrub(`ark ${response.status}: ${errorText(payload, response.status)}`, this.key));
    return payload;
  }
}

function readTask(payload: Record<string, unknown>): { id: string; status: string; videoUrl?: string; error?: string } {
  const id = typeof payload.id === "string" ? payload.id : "";
  if (!id) throw new Error("ark video task is missing id");
  const content = typeof payload.content === "object" && payload.content !== null
    ? (payload.content as Record<string, unknown>)
    : undefined;
  const videoUrl = typeof content?.video_url === "string" ? content.video_url : undefined;
  let error: string | undefined;
  if (typeof payload.error === "object" && payload.error !== null) {
    error = errorText(payload, 200);
  } else if (typeof payload.error === "string") {
    error = payload.error;
  }
  return {
    id,
    status: typeof payload.status === "string" ? payload.status : "queued",
    videoUrl,
    error,
  };
}

export function createArkClient(env: EnvLike, deps: ArkDeps = {}): ArkClient {
  if (!env.ARK_API_KEY?.trim()) throw new Error("ARK_API_KEY is not set");
  return new ArkClient(env, deps);
}

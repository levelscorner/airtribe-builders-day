import { randomUUID } from "node:crypto";
import type { EnvLike } from "../flags.js";
import { HF_API_BASE } from "./request.js";
import { higgsfieldAuthorization } from "./credentials.js";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HiggsfieldClientDeps {
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export type HfJobStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export interface HfStatus {
  status: HfJobStatus;
  request_id: string;
  status_url?: string;
  cancel_url?: string;
  error?: string;
  images?: Array<{ url: string }>;
  video?: { url?: string };
}

const TERMINAL = new Set<HfJobStatus>(["completed", "failed", "nsfw", "canceled"]);

const STATUSES = new Set<string>(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function concurrency(env: EnvLike): number {
  const parsed = Number(env.MEDIA_CONCURRENCY ?? "4");
  if (!Number.isFinite(parsed) || parsed < 1) return 4;
  return Math.floor(parsed);
}

function pollTimeout(env: EnvLike): number {
  const parsed = Number(env.HF_POLL_TIMEOUT_MS ?? "180000");
  if (!Number.isFinite(parsed) || parsed < 0) return 180_000;
  return parsed;
}

function retryDelayMs(header: string | null): number {
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  return 1000;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text.slice(0, 300) };
  }
}

function detail(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null) {
    const row = payload as Record<string, unknown>;
    if (typeof row.detail === "string" && row.detail.trim()) return row.detail.trim().slice(0, 300);
    if (typeof row.error === "string" && row.error.trim()) return row.error.trim().slice(0, 300);
  }
  return `request failed (${status})`;
}

function parseStatus(payload: unknown): HfStatus {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("higgsfield returned an empty status");
  }
  const row = payload as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : "";
  if (!STATUSES.has(status)) throw new Error(`higgsfield returned status ${status || "unknown"}`);
  const requestId = typeof row.request_id === "string" ? row.request_id : "";
  if (!requestId) throw new Error("higgsfield status is missing request_id");
  return {
    status: status as HfJobStatus,
    request_id: requestId,
    status_url: typeof row.status_url === "string" ? row.status_url : undefined,
    cancel_url: typeof row.cancel_url === "string" ? row.cancel_url : undefined,
    error: typeof row.error === "string" ? row.error : undefined,
    images: Array.isArray(row.images) ? (row.images as Array<{ url: string }>) : undefined,
    video: typeof row.video === "object" && row.video !== null ? (row.video as { url?: string }) : undefined,
  };
}

class Semaphore {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async use<T>(run: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await run();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.waiting.shift();
    if (next) next();
  }
}

export class HiggsfieldClient {
  private readonly fetch: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly authorization: string;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly slots: Semaphore;

  constructor(env: EnvLike, deps: HiggsfieldClientDeps = {}) {
    this.fetch = deps.fetch ?? fetch;
    this.sleep = deps.sleep ?? defaultSleep;
    this.random = deps.random ?? Math.random;
    this.now = deps.now ?? Date.now;
    this.authorization = higgsfieldAuthorization(env);
    this.base = (env.HF_API_BASE?.trim() || HF_API_BASE).replace(/\/$/, "");
    this.timeoutMs = pollTimeout(env);
    this.slots = new Semaphore(concurrency(env));
  }

  /** Submit takes a concurrency slot. Polling does not. */
  async generate(
    endpoint: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
    kind: "image" | "video",
  ): Promise<HfStatus> {
    const accepted = await this.slots.use(() => this.postGeneration(endpoint, body, idempotencyKey));
    return this.wait(accepted, kind);
  }

  async upload(bytes: Uint8Array, contentType: string): Promise<string> {
    return this.slots.use(async () => {
      const ticket = await this.postJson(`${this.base}/files/generate-upload-url`, { content_type: contentType });
      const row = ticket as Record<string, unknown>;
      const uploadUrl = typeof row.upload_url === "string" ? row.upload_url : "";
      const publicUrl = typeof row.public_url === "string" ? row.public_url : "";
      if (!uploadUrl || !publicUrl) throw new Error("higgsfield upload ticket is missing urls");
      const headers = new Headers();
      if (typeof row.upload_headers === "object" && row.upload_headers !== null) {
        for (const [key, value] of Object.entries(row.upload_headers as Record<string, unknown>)) {
          if (typeof value === "string" && key.toLowerCase() !== "authorization") headers.set(key, value);
        }
      }
      if (!headers.has("Content-Type")) headers.set("Content-Type", contentType);
      const put = await this.fetch(uploadUrl, { method: "PUT", headers, body: Buffer.from(bytes) });
      if (!put.ok) throw new Error(`higgsfield upload ${put.status}`);
      return publicUrl;
    });
  }

  private async postGeneration(
    endpoint: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
    attempt = 0,
  ): Promise<HfStatus> {
    const url = `${this.base}/${endpoint}`;
    let response: Response;
    try {
      response = await this.fetch(url, {
        method: "POST",
        headers: {
          Authorization: this.authorization,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (attempt < 1) return this.postGeneration(endpoint, body, idempotencyKey, attempt + 1);
      throw error;
    }

    if ((response.status === 429 || response.status === 503) && attempt < 3) {
      await response.arrayBuffer().catch(() => undefined);
      const delay = response.status === 429 ? retryDelayMs(response.headers.get("Retry-After")) : 500 * (attempt + 1);
      await this.sleep(delay);
      return this.postGeneration(endpoint, body, idempotencyKey, attempt + 1);
    }

    const payload = await readPayload(response);
    if (!response.ok) throw new Error(`higgsfield ${response.status}: ${detail(payload, response.status)}`);
    return parseStatus(payload);
  }

  private async wait(initial: HfStatus, kind: "image" | "video"): Promise<HfStatus> {
    let current = initial;
    let delay = kind === "video" ? 5000 : 2000;
    const started = this.now();
    while (!TERMINAL.has(current.status)) {
      if (this.now() - started > this.timeoutMs) throw new Error("higgsfield poll timed out");
      const jitter = Math.floor(this.random() * 500);
      await this.sleep(delay + jitter);
      current = await this.getStatus(current.status_url || `${this.base}/requests/${current.request_id}/status`);
      delay = Math.min(Math.round(delay * 1.5), 10_000);
    }
    return current;
  }

  private async getStatus(url: string, attempt = 0): Promise<HfStatus> {
    let response: Response;
    try {
      response = await this.fetch(url, { headers: { Authorization: this.authorization } });
    } catch (error) {
      if (attempt < 3) {
        await this.sleep(500 * (attempt + 1));
        return this.getStatus(url, attempt + 1);
      }
      throw error;
    }
    if (response.status >= 500 && attempt < 3) {
      await response.arrayBuffer().catch(() => undefined);
      await this.sleep(500 * (attempt + 1));
      return this.getStatus(url, attempt + 1);
    }
    const payload = await readPayload(response);
    if (!response.ok) throw new Error(`higgsfield ${response.status}: ${detail(payload, response.status)}`);
    return parseStatus(payload);
  }

  private async postJson(url: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.authorization,
        "Content-Type": "application/json",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify(body),
    });
    const payload = await readPayload(response);
    if (!response.ok) throw new Error(`higgsfield ${response.status}: ${detail(payload, response.status)}`);
    return payload;
  }
}

export function createHiggsfieldClient(env: EnvLike, deps: HiggsfieldClientDeps = {}): HiggsfieldClient {
  return new HiggsfieldClient(env, deps);
}

import { createHash } from "node:crypto";
import type { AgentReview, Brief } from "@chotu/shared";
import { remoteStatus, reviewFromRemote } from "./parse.js";

export const AGENTICORG_ORIGIN = "https://agenticorg.hackathon.pinelabs.com";
/** Spec: abort the run call after 120 seconds. */
export const AGENTICORG_TIMEOUT_MS = 120_000;

export type EnvLike = Record<string, string | undefined>;
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ScriptReviewInput {
  genre: string;
  brief: Brief;
  scriptText: string;
  env?: EnvLike;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export function buildScriptTask(input: { genre: string; brief: Brief; scriptText: string }): string {
  return [`Genre: ${input.genre}`, `Brief: ${JSON.stringify(input.brief)}`, `Script:\n${input.scriptText}`].join(
    "\n\n",
  );
}

export function agentRunUrl(agentId: string): string {
  return `${AGENTICORG_ORIGIN}/api/v1/agents/${encodeURIComponent(agentId)}/run`;
}

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/** Mock when MOCK=1, or when the agent id or API key is missing. */
export function agenticOrgMocked(env: EnvLike): boolean {
  if (truthy(env.MOCK)) return true;
  if (!env.AGENTICORG_API_KEY?.trim()) return true;
  if (!env.AGENTICORG_AGENT_ID?.trim()) return true;
  return false;
}

export function mockAgentReview(task: string): AgentReview {
  const taskSha256 = createHash("sha256").update(task).digest("hex");
  return {
    status: "mocked",
    confidence: 1,
    output: `Mock review ${taskSha256}`,
  };
}

/**
 * Review a script with AgenticOrg. Never throws: timeouts and network errors
 * come back as `failed` plus a warning. Does not log the request or the key.
 */
export async function runScriptReview(input: ScriptReviewInput): Promise<AgentReview> {
  const env = input.env ?? process.env;
  const task = buildScriptTask(input);
  if (agenticOrgMocked(env)) return mockAgentReview(task);
  const apiKey = env.AGENTICORG_API_KEY?.trim() ?? "";
  const agentId = env.AGENTICORG_AGENT_ID?.trim() ?? "";
  try {
    return await postRun({
      url: agentRunUrl(agentId),
      apiKey,
      task,
      fetchImpl: input.fetch ?? fetch,
      timeoutMs: input.timeoutMs ?? AGENTICORG_TIMEOUT_MS,
    });
  } catch {
    return { status: "failed", output: "", warning: "AgenticOrg review could not be reached" };
  }
}

async function postRun(input: {
  url: string;
  apiKey: string;
  task: string;
  fetchImpl: FetchLike;
  timeoutMs: number;
}): Promise<AgentReview> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.fetchImpl(input.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "process",
        inputs: { task: input.task },
        context: {},
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    const body = parseJson(text);
    // A 200 whose agent status is failed still carries a provider error.
    // Keep the pipeline moving and attach the deterministic mock instead.
    if (response.ok && remoteStatus(body) === "failed") {
      const parsed = reviewFromRemote(body, input.apiKey);
      return {
        ...mockAgentReview(input.task),
        warning: parsed.warning?.trim() || "AgenticOrg review failed",
      };
    }
    if (!response.ok) {
      if (body && typeof body === "object") {
        const parsed = reviewFromRemote(body, input.apiKey);
        if (parsed.status !== "failed" || parsed.warning !== "AgenticOrg review returned an unreadable status") {
          return parsed;
        }
      }
      return { status: "failed", output: "", warning: "AgenticOrg review failed" };
    }
    if (body === undefined) return { status: "failed", output: "", warning: "AgenticOrg review returned an unreadable status" };
    return reviewFromRemote(body, input.apiKey);
  } catch (error) {
    if (isAbort(error)) return { status: "failed", output: "", warning: "AgenticOrg review timed out" };
    return { status: "failed", output: "", warning: "AgenticOrg review could not be reached" };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

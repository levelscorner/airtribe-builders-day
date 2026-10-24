import { createHash } from "node:crypto";
import type { AgentReview, Brief } from "@chotu/shared";
import { reviewFromRemote } from "./parse.js";

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

/** `failed` and `budget_exceeded` stay non-blocking: mock review plus the warning. */
function soften(task: string, review: AgentReview): AgentReview {
  if (review.status !== "failed" && review.status !== "budget_exceeded") return review;
  const warning =
    review.warning?.trim() ||
    (review.status === "budget_exceeded"
      ? "AgenticOrg review stopped because the budget was exceeded"
      : "AgenticOrg review failed");
  return { ...mockAgentReview(task), warning };
}

/**
 * Review a script with AgenticOrg. Never throws. `failed` and `budget_exceeded`
 * (HTTP 200 `status: failed` included, plus timeouts and network errors) come
 * back as the mock review plus a warning. Does not log the request or the key.
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
    return soften(task, { status: "failed", output: "", warning: "AgenticOrg review could not be reached" });
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
    if (!response.ok && (body === undefined || typeof body !== "object")) {
      return soften(input.task, { status: "failed", output: "", warning: "AgenticOrg review failed" });
    }
    if (body === undefined) {
      return soften(input.task, {
        status: "failed",
        output: "",
        warning: "AgenticOrg review returned an unreadable status",
      });
    }
    // `failed` and `budget_exceeded`, including HTTP 200 `status: failed`,
    // become the mock review plus a warning. The script stage still continues.
    return soften(input.task, reviewFromRemote(body, input.apiKey));
  } catch (error) {
    if (isAbort(error)) return soften(input.task, { status: "failed", output: "", warning: "AgenticOrg review timed out" });
    return soften(input.task, { status: "failed", output: "", warning: "AgenticOrg review could not be reached" });
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

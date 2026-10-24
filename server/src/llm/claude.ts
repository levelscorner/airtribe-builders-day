import type { z } from "zod";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
/** Current Sonnet. Override with CLAUDE_MODEL. */
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-5";

const DEFAULT_TIMEOUT_MS = 45_000;

export class ClaudeCallError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "ClaudeCallError";
    this.retryable = retryable;
  }
}

export interface ClaudeJsonInput {
  system: string;
  prompt: string;
  schema: z.ZodTypeAny;
  schemaHint?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function completeClaudeJson(input: ClaudeJsonInput): Promise<unknown> {
  const firstText = await messageText(input, userPrompt(input, input.prompt));
  const first = readJson(firstText, input.schema);
  if (first.ok) return first.value;

  const repair = [
    input.prompt,
    "",
    "The previous JSON failed validation.",
    first.error,
    "Previous reply:",
    firstText.slice(0, 4000),
    "Return only the corrected JSON object.",
  ].join("\n");
  const secondText = await messageText(input, userPrompt(input, repair));
  const second = readJson(secondText, input.schema);
  if (second.ok) return second.value;
  throw new ClaudeCallError("Claude returned JSON that failed validation", false);
}

function userPrompt(input: ClaudeJsonInput, prompt: string): string {
  if (!input.schemaHint) return prompt;
  return `${prompt}\n\nJSON shape: ${input.schemaHint}`;
}

function systemText(input: ClaudeJsonInput): string {
  return [input.system, "Reply with one JSON object and no markdown."].join("\n");
}

async function messageText(input: ClaudeJsonInput, prompt: string): Promise<string> {
  const apiKey = (input.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new ClaudeCallError("ANTHROPIC_API_KEY is required for the claude provider", false);
  }
  const model =
    (input.model ?? process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL).trim() || DEFAULT_CLAUDE_MODEL;
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let last: Error | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await postMessage(fetchImpl, apiKey, model, systemText(input), prompt, timeoutMs);
    } catch (error) {
      last = error instanceof Error ? error : new Error("Claude request failed");
      const retryable = error instanceof ClaudeCallError ? error.retryable : true;
      if (!retryable || attempt === 1) throw last;
    }
  }
  throw last ?? new ClaudeCallError("Claude request failed", false);
}

async function postMessage(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  system: string,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      throw new ClaudeCallError(`Claude request failed (${response.status})`, retryable);
    }
    let body: { content?: Array<{ type?: string; text?: string }> };
    try {
      body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
    } catch {
      throw new ClaudeCallError("Claude request failed (bad response)", true);
    }
    const text = (body.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    if (!text.trim()) throw new ClaudeCallError("Claude request failed (empty)", true);
    return text;
  } catch (error) {
    if (error instanceof ClaudeCallError) throw error;
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new ClaudeCallError("Claude request timed out", true);
    }
    throw new ClaudeCallError("Claude request failed (network)", true);
  } finally {
    clearTimeout(timer);
  }
}

function readJson(
  text: string,
  schema: z.ZodTypeAny,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: schema.parse(extractJson(text)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "invalid JSON" };
  }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const raw = (fenced?.[1] ?? trimmed).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("not json");
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

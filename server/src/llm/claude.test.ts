import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { ANTHROPIC_MESSAGES_URL, ANTHROPIC_VERSION, completeClaudeJson, DEFAULT_CLAUDE_MODEL } from "./claude.js";
import { claudeOpeningBrief, claudeParseFreeText, claudeQuestion } from "./intake.js";
import { resolveLlmProvider } from "./provider.js";
import { creativeGenEnv } from "./wire.js";

const SECRET = "sk-ant-test-secret";
const OkSchema = z.object({ ok: z.boolean() });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function claudeMessage(text: string, status = 200): Response {
  return jsonResponse({ content: [{ type: "text", text }] }, status);
}

test("provider stays on mock samples when MOCK=1, even with a key", () => {
  assert.equal(resolveLlmProvider({ MOCK: "1", ANTHROPIC_API_KEY: SECRET, LLM_PROVIDER: "claude" }), "mock");
  assert.equal(resolveLlmProvider({ LLM_PROVIDER: "mock", ANTHROPIC_API_KEY: SECRET }), "mock");
  assert.equal(resolveLlmProvider({ ANTHROPIC_API_KEY: SECRET }), "claude");
  assert.equal(resolveLlmProvider({ LLM_PROVIDER: "claude" }), "claude");
  assert.equal(resolveLlmProvider({}), "mock");
  assert.equal(creativeGenEnv(OkSchema, "{}", { MOCK: "1", ANTHROPIC_API_KEY: SECRET }).mock, true);
});

test("messages call uses the Anthropic headers, model, timeout retry, and repair", async () => {
  const calls: Array<{ url: string; headers: Headers; body: { model?: string; system?: string } }> = [];
  let attempt = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    attempt += 1;
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      headers,
      body: JSON.parse(String(init?.body)) as { model?: string; system?: string },
    });
    if (attempt === 1) return jsonResponse({ error: "busy" }, 500);
    if (attempt === 2) return claudeMessage("not json");
    return claudeMessage('```json\n{"ok":true}\n```');
  };

  const value = await completeClaudeJson({
    system: "test",
    prompt: "ping",
    schema: OkSchema,
    schemaHint: '{"ok":true}',
    apiKey: SECRET,
    fetchImpl,
  });

  assert.deepEqual(value, { ok: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.url, ANTHROPIC_MESSAGES_URL);
  assert.equal(calls[0]?.headers.get("x-api-key"), SECRET);
  assert.equal(calls[0]?.headers.get("anthropic-version"), ANTHROPIC_VERSION);
  assert.equal(calls[0]?.body.model, DEFAULT_CLAUDE_MODEL);
  assert.match(calls[0]?.body.system ?? "", /JSON object/);
  assert.equal(calls[0]?.body.system?.includes(SECRET), false);
});

test("a client error is not retried and the error text omits the key", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return jsonResponse({ error: SECRET }, 400);
  };
  await assert.rejects(
    () =>
      completeClaudeJson({
        system: "test",
        prompt: "ping",
        schema: OkSchema,
        apiKey: SECRET,
        fetchImpl,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes(SECRET), false);
      assert.match(error.message, /400/);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("a timeout is retried once", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls === 1) {
      const abort = new Error("aborted");
      abort.name = "AbortError";
      throw abort;
    }
    return claudeMessage('{"ok":true}');
  };
  const value = await completeClaudeJson({
    system: "test",
    prompt: "ping",
    schema: OkSchema,
    apiKey: SECRET,
    timeoutMs: 20,
    fetchImpl,
  });
  assert.deepEqual(value, { ok: true });
  assert.equal(calls, 2);
});

test("free-text Hindi and a generated question stay on the brief contract", async () => {
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { system?: string };
    if ((body.system ?? "").includes("Extract one value")) return claudeMessage('{"value":"Hindi"}');
    return claudeMessage(
      JSON.stringify({
        field: "language",
        prompt: "Narration kis bhasha mein honi chahiye?",
        options: [
          { id: "hi", label: "Hindi" },
          { id: "hinglish", label: "Hinglish" },
          { id: "en", label: "English" },
        ],
        allowFreeText: true,
        allowSkip: true,
        allowDefaults: true,
      }),
    );
  };
  const parsed = await claudeParseFreeText(
    { genre: "kids", topic: "bees" },
    { field: "language", freeText: "Hindi please" },
    { fetchImpl, apiKey: SECRET },
  );
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.brief.language, "hi");

  const question = await claudeQuestion(
    { genre: "kids", topic: "bees" },
    {
      field: "language",
      prompt: "Which language?",
      options: [
        { id: "hi", label: "Hindi" },
        { id: "hinglish", label: "Hinglish" },
        { id: "en", label: "English" },
      ],
      allowSkip: true,
      allowDefaults: true,
    },
    { fetchImpl, apiKey: SECRET },
  );
  assert.equal(question.field, "language");
  assert.match(question.prompt, /bhasha/);
  assert.deepEqual(
    question.options?.map((option) => option.id),
    ["hi", "hinglish", "en"],
  );
});

test("opening intake cannot silently fill unspecified creator preferences", async () => {
  const fallback = { genre: "kids" as const, topic: "bees" };
  const fetchImpl: typeof fetch = async () => claudeMessage(JSON.stringify({ topic: "how bees make honey", genre: "kids", language: "en", targetSeconds: 45, aspectRatio: "9:16", artStyle: "bright-2d-cartoon", castIds: ["preset_mini"] }));
  const brief = await claudeOpeningBrief("Explain bees", fallback, { fetchImpl, apiKey: SECRET });
  assert.equal(brief.topic, "how bees make honey");
  assert.equal(brief.genre, "kids");
  for (const field of ["language", "targetSeconds", "aspectRatio", "artStyle", "castIds"]) assert.equal((brief as Record<string, unknown>)[field], undefined);
});

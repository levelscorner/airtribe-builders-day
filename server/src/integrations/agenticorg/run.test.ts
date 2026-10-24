import assert from "node:assert/strict";
import test from "node:test";
import type { AgentReview, AgentReviewStatus } from "@chotu/shared";
import { scriptArtefactState } from "./parse.js";
import {
  AGENTICORG_TIMEOUT_MS,
  agenticOrgMocked,
  runScriptReview,
  type EnvLike,
  type FetchLike,
  type ScriptReviewInput,
} from "./run.js";

const KEY = "test-agent-key";
const AGENT = "agent/42";

const base: ScriptReviewInput = {
  genre: "kids",
  brief: { topic: "why bees make honey", audience: "children" },
  scriptText: "1. hook\nBees share nectar.",
};

function liveEnv(extra: EnvLike = {}): EnvLike {
  return { MOCK: "0", AGENTICORG_API_KEY: KEY, AGENTICORG_AGENT_ID: AGENT, ...extra };
}

function header(init: RequestInit | undefined, name: string): string {
  const headers = init?.headers;
  if (!headers || headers instanceof Headers || Array.isArray(headers)) return "";
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? (record[key] ?? "") : "";
}

function jsonFetch(body: unknown, status = 200): { fetch: FetchLike; calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fetchImpl, calls };
}

async function withoutConsole<T>(run: () => Promise<T>): Promise<T> {
  const names = ["log", "info", "warn", "error", "debug"] as const;
  const previous = names.map((name) => console[name]);
  let hits = 0;
  for (const name of names) {
    console[name] = () => {
      hits += 1;
    };
  }
  try {
    const result = await run();
    assert.equal(hits, 0);
    return result;
  } finally {
    names.forEach((name, index) => {
      console[name] = previous[index]!;
    });
  }
}

test("remote statuses are copied onto the review", async () => {
  const cases: Array<{ status: "completed" | "hitl_triggered" | "budget_exceeded"; confidence: number; output: string | string[] }> = [
    { status: "completed", confidence: 0.91, output: ["Shorten the hook to one line."] },
    { status: "hitl_triggered", confidence: 0.4, output: "Check the claim." },
    { status: "budget_exceeded", confidence: 0, output: "Stopped before scene 3.\nRetry the ending." },
  ];
  for (const item of cases) {
    const { fetch: fetchImpl, calls } = jsonFetch({
      status: item.status,
      confidence: item.confidence,
      output: item.output,
    });
    const review = await withoutConsole(() =>
      runScriptReview({ ...base, env: liveEnv(), fetch: fetchImpl, timeoutMs: 5_000 }),
    );
    assert.equal(calls.length, 1);
    assert.equal(review.status, item.status);
    assert.equal(review.confidence, item.confidence);
    assert.deepEqual(review.output, item.output);
    assert.equal(scriptArtefactState(review), "awaiting_approval");
    if (item.status === "budget_exceeded") {
      assert.equal(review.warning, "AgenticOrg review stopped because the budget was exceeded");
    } else {
      assert.equal(review.warning, undefined);
    }
    const raw = JSON.stringify(review);
    assert.equal(raw.includes(KEY), false);
    assert.equal(raw.toLowerCase().includes("authorization"), false);
  }
});

test("http 200 status failed falls back to the mock review", async () => {
  const { fetch: fetchImpl, calls } = jsonFetch({
    status: "failed",
    error: "OpenAIInvalidRequestError",
    output: {},
  });
  const review = await withoutConsole(() => runScriptReview({ ...base, env: liveEnv(), fetch: fetchImpl }));
  const mock = await runScriptReview({ ...base, env: { MOCK: "1" } });
  assert.equal(calls.length, 1);
  assert.equal(review.status, "mocked");
  assert.equal(review.confidence, mock.confidence);
  assert.deepEqual(review.output, mock.output);
  assert.equal(review.warning, "OpenAIInvalidRequestError");
  assert.equal(scriptArtefactState(review), "awaiting_approval");
  assert.equal(JSON.stringify(review).includes(KEY), false);
});

test("the run request posts genre, brief, and script text", async () => {
  const { fetch: fetchImpl, calls } = jsonFetch({ status: "completed", confidence: 1, output: { ok: true } });
  await runScriptReview({ ...base, env: liveEnv(), fetch: fetchImpl });
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, "https://agenticorg.hackathon.pinelabs.com/api/v1/agents/agent%2F42/run");
  assert.equal(call.init?.method, "POST");
  assert.equal(header(call.init, "authorization"), `Bearer ${KEY}`);
  assert.equal(header(call.init, "content-type"), "application/json");
  assert.ok(call.init?.signal instanceof AbortSignal);
  const body = JSON.parse(String(call.init?.body)) as {
    action: string;
    inputs: { task: string };
    context: Record<string, unknown>;
  };
  assert.equal(body.action, "process");
  assert.deepEqual(body.context, {});
  assert.match(body.inputs.task, /Genre: kids/);
  assert.match(body.inputs.task, /why bees make honey/);
  assert.match(body.inputs.task, /Bees share nectar/);
  assert.equal(JSON.stringify(body).includes(KEY), false);
});

test("a nested result envelope still yields status, confidence, and output", async () => {
  const { fetch: fetchImpl } = jsonFetch({
    id: "run_1",
    result: { status: "completed", confidence: 0.5, output: "ok" },
  });
  const review = await runScriptReview({ ...base, env: liveEnv(), fetch: fetchImpl });
  assert.equal(review.status, "completed");
  assert.equal(review.confidence, 0.5);
  assert.equal(review.output, "ok");
});

test("an error string that echoes the key is redacted", async () => {
  const { fetch: fetchImpl } = jsonFetch({
    status: "failed",
    error: `upstream rejected Bearer ${KEY} and ${KEY}`,
  });
  const review = await runScriptReview({ ...base, env: liveEnv(), fetch: fetchImpl });
  assert.equal(review.status, "mocked");
  assert.equal(review.warning?.includes(KEY), false);
  assert.match(review.warning ?? "", /\[redacted\]/);
  assert.equal(JSON.stringify(review.output).includes(KEY), false);
});

test("timeout and network errors are non-blocking failures", async () => {
  const hanging: FetchLike = (_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing abort signal"));
        return;
      }
      const fail = () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (signal.aborted) fail();
      else signal.addEventListener("abort", fail, { once: true });
    });
  const timed = await runScriptReview({ ...base, env: liveEnv(), fetch: hanging, timeoutMs: 30 });
  assert.equal(timed.status, "failed");
  assert.equal(timed.warning, "AgenticOrg review timed out");
  assert.equal(scriptArtefactState(timed), "awaiting_approval");

  const offline: FetchLike = async () => {
    throw new TypeError("network down");
  };
  const dropped = await runScriptReview({ ...base, env: liveEnv(), fetch: offline });
  assert.equal(dropped.status, "failed");
  assert.equal(dropped.warning, "AgenticOrg review could not be reached");
  assert.equal(dropped.warning?.includes(KEY), false);
});

test("http failures and unreadable bodies do not throw", async () => {
  const { fetch: fetchImpl } = jsonFetch("nope", 502);
  const http = await runScriptReview({
    ...base,
    env: liveEnv(),
    fetch: async (url, init) => {
      const response = await fetchImpl(url, init);
      return new Response("not-json", { status: response.status });
    },
  });
  assert.equal(http.status, "failed");
  assert.equal(http.warning, "AgenticOrg review failed");

  const { fetch: failedHttp } = jsonFetch(
    { status: "failed", error: "OpenAIInvalidRequestError", output: {} },
    500,
  );
  const httpFailed = await runScriptReview({ ...base, env: liveEnv(), fetch: failedHttp });
  assert.equal(httpFailed.status, "failed");
  assert.equal(httpFailed.warning, "OpenAIInvalidRequestError");

  const { fetch: weird } = jsonFetch({ status: "running" });
  const unknown = await runScriptReview({ ...base, env: liveEnv(), fetch: weird });
  assert.equal(unknown.status, "failed");
  assert.equal(unknown.warning, "AgenticOrg review returned an unreadable status");
});

test("mock fallback is deterministic and does not call fetch", async () => {
  assert.equal(AGENTICORG_TIMEOUT_MS, 120_000);
  const envs: EnvLike[] = [
    { MOCK: "1", AGENTICORG_API_KEY: KEY, AGENTICORG_AGENT_ID: AGENT },
    { MOCK: "0", AGENTICORG_AGENT_ID: AGENT },
    { MOCK: "0", AGENTICORG_API_KEY: "   ", AGENTICORG_AGENT_ID: AGENT },
    { MOCK: "0", AGENTICORG_API_KEY: KEY },
  ];
  assert.equal(agenticOrgMocked({ MOCK: "0", AGENTICORG_API_KEY: KEY, AGENTICORG_AGENT_ID: AGENT }), false);
  for (const env of envs) {
    assert.equal(agenticOrgMocked(env), true);
    let calls = 0;
    const review = await runScriptReview({
      ...base,
      env,
      fetch: async () => {
        calls += 1;
        throw new Error(`Bearer ${KEY}`);
      },
    });
    assert.equal(calls, 0);
    assert.equal(review.status, "mocked");
    assert.equal(review.confidence, 1);
    assert.equal(JSON.stringify(review).includes(KEY), false);
  }
  const again = await runScriptReview({ ...base, env: { MOCK: "1" } });
  const first = await runScriptReview({ ...base, env: { MOCK: "1" } });
  assert.deepEqual(first, again);
  const other = await runScriptReview({ ...base, scriptText: "different line", env: { MOCK: "1" } });
  assert.notDeepEqual(first.output, other.output);
});

test("missing process env keys use the mock and do not read a stale header", async () => {
  const previous = {
    MOCK: process.env.MOCK,
    AGENTICORG_API_KEY: process.env.AGENTICORG_API_KEY,
    AGENTICORG_AGENT_ID: process.env.AGENTICORG_AGENT_ID,
  };
  process.env.MOCK = "0";
  delete process.env.AGENTICORG_API_KEY;
  delete process.env.AGENTICORG_AGENT_ID;
  try {
    const review = await runScriptReview(base);
    assert.equal(review.status, "mocked");
  } finally {
    restore("MOCK", previous.MOCK);
    restore("AGENTICORG_API_KEY", previous.AGENTICORG_API_KEY);
    restore("AGENTICORG_AGENT_ID", previous.AGENTICORG_AGENT_ID);
  }
});

function restore(name: "MOCK" | "AGENTICORG_API_KEY" | "AGENTICORG_AGENT_ID", value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

type PanelAgentReview = {
  status: "completed" | "failed" | "hitl_triggered" | "budget_exceeded";
  confidence?: number;
  output: string | string[];
};

test("a panel review imports onto AgentReview and reads output as text", () => {
  const panel: PanelAgentReview = {
    status: "completed",
    confidence: 0.74,
    output: ["Shorten the hook to one line.", "Name the cast in scene 2.", "End on a question."],
  };
  const shared: AgentReview = panel;
  const fixes = Array.isArray(shared.output)
    ? shared.output.map((line) => line.trim()).filter(Boolean)
    : shared.output.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  assert.deepEqual(fixes, panel.output);
});

test("every review status leaves the script step awaiting approval", () => {
  const statuses: AgentReviewStatus[] = ["completed", "failed", "hitl_triggered", "budget_exceeded", "mocked"];
  for (const status of statuses) {
    const review: AgentReview = { status, output: "" };
    assert.equal(scriptArtefactState(review), "awaiting_approval");
  }
});

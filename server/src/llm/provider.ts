export type LlmProviderId = "claude" | "mock";

/**
 * Claude when a key is set and MOCK is not 1.
 * MOCK=1 always stays on the sample generators.
 * LLM_PROVIDER=claude|mock overrides that default, except MOCK=1 still wins.
 */
export function resolveLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProviderId {
  if (env.MOCK === "1") return "mock";
  const explicit = (env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (explicit === "mock") return "mock";
  if (explicit === "claude") return "claude";
  if ((env.ANTHROPIC_API_KEY ?? "").trim()) return "claude";
  return "mock";
}

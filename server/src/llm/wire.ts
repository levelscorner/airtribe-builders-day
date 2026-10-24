import type { z } from "zod";
import { completeClaudeJson } from "./claude.js";
import { resolveLlmProvider } from "./provider.js";

export const SCRIPT_JSON_HINT =
  '{"scenes":[{"idx":0,"title":"hook","narration":"Narrator: line\\nName: spoken line","durationMs":9000,"doubts":[],"castIds":["id"]}]}';

export const SCENE_PLAN_HINT =
  '{"scenes":[{"imagePrompt":"portrait, cast identity, AI-generated scene.","motionPrompt":"push-in, 5 seconds, no ratio, AI-generated scene.","durationSec":5,"vo":"about thirteen words here","voiceId":"playful_young_male"}]}';

export const PROMPT_JSON_HINT =
  '{"imagePrompt":"traits. identityText. dna. <<<element_id>>> AI-generated scene.","videoPrompt":"camera, pace, duration, identityText, <<<element_id>>> AI-generated scene.","elementIds":["element_id"]}';

/** Mock samples unless this process should call Claude. */
export function creativeGenEnv(
  schema: z.ZodTypeAny,
  schemaHint: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): { mock: boolean; complete?: (request: { system: string; prompt: string }) => Promise<unknown> } {
  if (resolveLlmProvider(env) !== "claude") return { mock: true };
  return {
    mock: false,
    complete: (request) =>
      completeClaudeJson({
        system: request.system,
        prompt: request.prompt,
        schema,
        schemaHint,
        fetchImpl,
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.CLAUDE_MODEL,
      }),
  };
}

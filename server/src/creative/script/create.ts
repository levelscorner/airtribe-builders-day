import type { MockableFactory, ScriptGen, ScriptGenInput } from "@chotu/shared";
import { feedbackOf, productOf, topicOf } from "../intake/notes.js";
import { completeWithModel, readApiKey, readComplete, readSkillsRoot } from "../llm.js";
import { parseScriptGenOutput, ScriptGenOutputSchema } from "../schema.js";
import { INHERITED_RULES, SCRIPT_TASK } from "../skills/rules.js";
import { loadSkillPacks, systemPrompt } from "../skills/load.js";
import { getGenre } from "../genres/load.js";
import { assertScriptRules, mockScript } from "./mock.js";

function userPrompt(input: ScriptGenInput): string {
  const genre = getGenre(input.genre);
  return JSON.stringify({
    videoId: input.videoId,
    genre: input.genre,
    language: input.language,
    targetSeconds: input.targetSeconds,
    beats: genre.beats,
    tone: genre.tone,
    shape: genre.shape,
    topic: topicOf(input.brief, genre.defaultTopic),
    product: productOf(input.brief, genre.defaultProduct ?? ""),
    audience: input.brief.audience,
    feedback: feedbackOf(input.brief) ?? "",
    cast: input.cast.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      identityText: member.identityText,
    })),
  });
}

export const createScriptGen: MockableFactory<ScriptGen> = (env) => ({
  async generate(input) {
    const output = env.mock
      ? mockScript(input)
      : parseScriptGenOutput(await completeScript(input, env));
    assertScriptRules(input, output);
    return output;
  },
});

async function completeScript(
  input: ScriptGenInput,
  env: { [key: string]: unknown },
): Promise<unknown> {
  const skills = loadSkillPacks({
    packs: ["script", "ingredients", "sound"],
    genre: input.genre,
    root: readSkillsRoot(env),
  });
  const request = {
    system: systemPrompt(skills, SCRIPT_TASK, INHERITED_RULES),
    prompt: userPrompt(input),
  };
  const complete = readComplete(env);
  if (complete) return complete(request);
  if (!readApiKey(env)) throw new Error("LLM_API_KEY is required when MOCK is not set.");
  return completeWithModel(request, ScriptGenOutputSchema, env);
}

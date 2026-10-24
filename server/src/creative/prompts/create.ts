import type { MockableFactory, PromptGen, PromptGenInput } from "@chotu/shared";
import { completeWithModel, readApiKey, readComplete, readSkillsRoot } from "../llm.js";
import { parsePromptGenOutput, PromptGenOutputSchema } from "../schema.js";
import { loadSkillPacks, systemPrompt } from "../skills/load.js";
import { withRoutedSkills } from "../skills/router.js";
import { INHERITED_RULES, PROMPT_TASK } from "../skills/rules.js";
import { assertPromptRules, mockPrompts } from "./mock.js";

function userPrompt(input: PromptGenInput): string {
  return JSON.stringify({
    videoId: input.videoId,
    artStyle: input.artStyle ?? input.brief.artStyle,
    artStyleTraits: input.brief.artStyleTraits,
    aspectRatio: input.brief.aspectRatio ?? "9:16",
    scene: {
      id: input.scene.id,
      idx: input.scene.idx,
      title: input.scene.title,
      narration: input.scene.narration,
      durationMs: input.scene.durationMs,
      castIds: input.scene.castIds,
    },
    cast: input.cast.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      identityText: member.identityText,
      dnaChips: member.dnaChips,
      higgsfieldElementId: member.higgsfieldElementId,
    })),
    feedback: input.feedback?.trim() ?? "",
  });
}

export const createPromptGen: MockableFactory<PromptGen> = (env) => ({
  async generate(input) {
    const output = env.mock
      ? mockPrompts(input)
      : parsePromptGenOutput(await completePrompt(input, env));
    assertPromptRules(input, output);
    return output;
  },
});

async function completePrompt(
  input: PromptGenInput,
  env: { [key: string]: unknown },
): Promise<unknown> {
  const skills = loadSkillPacks({
    packs: ["image", "video", "ingredients", "models"],
    genre: input.brief.genre,
    root: readSkillsRoot(env),
  });
  const request = {
    system: withRoutedSkills(
      systemPrompt(skills, PROMPT_TASK, INHERITED_RULES),
      input.brief.genre ?? "kids",
      ["image prompt", "motion prompt"],
    ),
    prompt: userPrompt(input),
  };
  const complete = readComplete(env);
  if (complete) return complete(request);
  if (!readApiKey(env)) throw new Error("LLM_API_KEY is required when MOCK is not set.");
  return completeWithModel(request, PromptGenOutputSchema, env);
}

import type {
  MockableFactory,
  PromptGen,
  PromptGenInput,
  PromptGenOutput,
} from "@chotu/shared";
import {
  completeWithModel,
  readApiKey,
  readComplete,
  readSkillsRoot,
} from "../llm.js";
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
      : retainReferences(
          input,
          parsePromptGenOutput(await completePrompt(input, env)),
        );
    if (env.mock) assertPromptRules(input, output);
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
  if (!readApiKey(env))
    throw new Error("LLM_API_KEY is required when MOCK is not set.");
  return completeWithModel(request, PromptGenOutputSchema, env);
}

export function retainReferences(
  input: PromptGenInput,
  generated: PromptGenOutput,
): PromptGenOutput {
  const cast = input.cast.filter(
    (member) =>
      !input.scene.castIds.length || input.scene.castIds.includes(member.id),
  );
  const visible = cast.filter((member) => member.role !== "narrator");
  const identities = (visible.length ? visible : cast).map(
    (member) => member.identityText,
  );
  const elementIds = visible.flatMap((member) =>
    member.higgsfieldElementId ? [member.higgsfieldElementId] : [],
  );
  const retain = (prompt: string) => {
    let result = prompt.replace(/<<<[^>]+>>>/g, " ").trim();
    for (const identity of identities)
      if (!result.includes(identity)) result += ` ${identity}`;
    for (const id of elementIds) result += ` <<<${id}>>>`;
    if (!result.includes("AI-generated scene."))
      result += " AI-generated scene.";
    return result;
  };
  return {
    ...generated,
    imagePrompt: retain(generated.imagePrompt),
    videoPrompt: retain(generated.videoPrompt),
    elementIds,
  };
}

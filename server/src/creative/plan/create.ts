import type { CastMember, MockableFactory, ScenePlan, ScriptGenInput } from "@chotu/shared";
import { getGenre } from "../genres/load.js";
import { topicOf } from "../intake/notes.js";
import { readComplete } from "../llm.js";
import { ScenePlanSchema } from "../schema.js";
import { INHERITED_RULES } from "../skills/rules.js";
import { withRoutedSkills } from "../skills/router.js";
import { VOICE_BANK, defaultVoiceId, isVoiceId } from "./voices.js";

const PLAN_STAGES = ["script", "image prompt", "motion prompt", "voiceover"] as const;

const PLAN_TASK = [
  "Plan the scenes for one short video. Neptune will render images, clips, and voice. You only write the plan.",
  "Return JSON { scenes: [{ imagePrompt, motionPrompt, durationSec, vo, voiceId }] }.",
  "4 to 6 scenes. durationSec is 5 or 10.",
  "vo is about 2.5 words per second.",
  "imagePrompt is a gpt-image-2 portrait still and repeats each on-screen cast identityText and dnaChips.",
  "motionPrompt is a Seedance 2.5 image-to-video prompt. Do not set a ratio.",
  "voiceId is one of the voice bank ids.",
  "If feedback is set, revise the plan to honour it.",
].join("\n");

export function planDurations(targetSeconds: number): Array<5 | 10> {
  const target = Math.max(20, Math.min(60, targetSeconds));
  let best: Array<5 | 10> = [5, 5, 5, 5];
  let bestDiff = Math.abs(20 - target);
  for (let count = 4; count <= 6; count += 1) {
    for (let tens = 0; tens <= count; tens += 1) {
      const fives = count - tens;
      const sum = tens * 10 + fives * 5;
      const diff = Math.abs(sum - target);
      const closerCount = Math.abs(count - 5) < Math.abs(best.length - 5);
      if (diff < bestDiff || (diff === bestDiff && closerCount)) {
        bestDiff = diff;
        best = [...Array<5 | 10>(tens).fill(10), ...Array<5 | 10>(fives).fill(5)];
      }
    }
  }
  return best;
}

export function wordsFor(durationSec: number): number {
  return Math.round(durationSec * 2.5);
}

function lineOf(wordCount: number, topic: string, speaker: string): string {
  const seed = `${speaker} talks about ${topic}`.split(/\s+/).filter(Boolean);
  const filler = ["today", "in", "one", "clear", "step", "with", "care"];
  const words = [...seed];
  let index = 0;
  while (words.length < wordCount) {
    words.push(filler[index % filler.length] ?? "today");
    index += 1;
  }
  return words.slice(0, wordCount).join(" ");
}

function onScreen(cast: readonly CastMember[]): CastMember[] {
  return cast.filter((member) => member.role !== "narrator");
}

function castBlock(cast: readonly CastMember[]): string {
  const visible = onScreen(cast);
  if (visible.length === 0) {
    return "No person. No face on screen.";
  }
  return visible
    .map((member) => `${member.identityText} Traits: ${member.dnaChips.join(", ")}.`)
    .join(" ");
}

export function mockScenePlan(input: ScriptGenInput): ScenePlan {
  const genre = getGenre(input.genre);
  const topic = topicOf(input.brief, genre.defaultTopic);
  const speaker = onScreen(input.cast)[0]?.name ?? "Narrator";
  const voice =
    input.cast.map((member) => member.voiceId).find((id) => id && isVoiceId(id)) ??
    defaultVoiceId(input.genre);
  const look = castBlock(input.cast);
  const feedback = input.feedback?.trim();
  return {
    scenes: planDurations(input.targetSeconds).map((durationSec) => ({
      imagePrompt: [
        "Portrait 9:16 still, no text, no letters, no logo.",
        look,
        `Subject: ${topic}.`,
        feedback ? `Apply this change: ${feedback}` : "",
        "AI-generated scene.",
      ]
        .filter((part) => part.length > 0)
        .join(" "),
      motionPrompt: [
        "Image-to-video from the still.",
        `One slow push-in. Pace steady. Duration ${durationSec} seconds.`,
        look,
        "Do not set an output ratio.",
        feedback ? `Apply this change: ${feedback}` : "",
        "AI-generated scene.",
      ]
        .filter((part) => part.length > 0)
        .join(" "),
      durationSec,
      vo: lineOf(wordsFor(durationSec), topic, speaker),
      voiceId: voice,
    })),
  };
}

export function assertScenePlan(input: ScriptGenInput, plan: ScenePlan): void {
  if (plan.scenes.length < 4 || plan.scenes.length > 6) {
    throw new Error("Scene plan must have 4 to 6 scenes.");
  }
  const visible = onScreen(input.cast);
  for (const scene of plan.scenes) {
    if (!isVoiceId(scene.voiceId)) throw new Error(`Unknown voiceId ${scene.voiceId}.`);
    const words = scene.vo.trim().split(/\s+/).filter(Boolean).length;
    const target = scene.durationSec * 2.5;
    if (words < target * 0.5 || words > target * 1.6) {
      throw new Error(`vo has ${words} words; expected about ${target} for ${scene.durationSec}s.`);
    }
    for (const member of visible) {
      if (!scene.imagePrompt.includes(member.identityText)) {
        throw new Error(`imagePrompt dropped the identity for ${member.name}.`);
      }
    }
    if (visible.length === 0 && !/no person/i.test(scene.imagePrompt)) {
      throw new Error("A faceless image prompt must say no person.");
    }
  }
}

export const createScenePlan: MockableFactory<{ generate(input: ScriptGenInput): Promise<ScenePlan> }> = (env) => ({
  async generate(input) {
    const plan = env.mock ? mockScenePlan(input) : ScenePlanSchema.parse(await completePlan(input, env));
    if (env.mock) assertScenePlan(input, plan);
    return plan;
  },
});

async function completePlan(input: ScriptGenInput, env: { [key: string]: unknown }): Promise<unknown> {
  const genre = getGenre(input.genre);
  const request = {
    system: withRoutedSkills(
      [PLAN_TASK, INHERITED_RULES, `Voice bank: ${VOICE_BANK.map((voice) => voice.id).join(", ")}.`].join("\n"),
      input.genre,
      PLAN_STAGES,
    ),
    prompt: JSON.stringify({
      genre: input.genre,
      language: input.language,
      targetSeconds: input.targetSeconds,
      tone: genre.tone,
      topic: topicOf(input.brief, genre.defaultTopic),
      audience: input.brief.audience,
      artStyle: input.brief.artStyle,
      aspectRatio: input.brief.aspectRatio,
      feedback: input.feedback?.trim() ?? "",
      suggestedDurations: planDurations(input.targetSeconds),
      cast: input.cast.map((member) => ({
        name: member.name,
        role: member.role,
        identityText: member.identityText,
        dnaChips: member.dnaChips,
        voiceId: member.voiceId,
      })),
    }),
  };
  const complete = readComplete(env);
  if (complete) return complete(request);
  throw new Error("Scene plan needs the Claude complete function when MOCK is not set.");
}

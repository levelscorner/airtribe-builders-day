import type { Brief, CastMember, Genre, ScriptGenInput, ScriptGenOutput } from "@chotu/shared";
import { getGenre } from "../genres/load.js";
import { feedbackOf, productOf, topicOf } from "../intake/notes.js";
import { stripBlockedNames } from "../intake/art-style.js";
import { genericLines, libraryLines } from "./library.js";

/** Omitted brief.sceneCount. One starter grant covers this many scenes. */
export const DEFAULT_SCENE_COUNT = 2;

export function sceneCountOf(brief: Pick<Brief, "sceneCount"> | undefined): number {
  const value = brief?.sceneCount;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6) return value;
  return DEFAULT_SCENE_COUNT;
}

const EDITORIAL: Record<Genre, string> = {
  kids: "Confirm the quiz has one clear answer a child can say aloud.",
  ad: "Confirm the offer price and expiry with the shop before this airs.",
  faceless: "Confirm the payoff stays general and does not invent a date or a record.",
};

export function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/\s+/g, " ");
}

export function sceneCastIds(cast: readonly CastMember[], beat: string, index: number): string[] {
  const narrators = cast.filter((member) => member.role === "narrator").map((member) => member.id);
  const products = cast.filter((member) => member.role === "product").map((member) => member.id);
  const onScreen = cast.filter((member) => member.role !== "narrator" && member.role !== "product");
  if (onScreen.length === 0) return narrators;
  const group = new Set(["hook", "quiz", "cta", "payoff", "offer"]);
  const visible =
    group.has(beat) || onScreen.length === 1
      ? onScreen.map((member) => member.id)
      : [onScreen[index % onScreen.length]!.id];
  const withProduct = beat === "product" || beat === "offer" ? products : [];
  return [...visible, ...withProduct, ...narrators];
}

function titleFor(beat: string, index: number, beats: readonly string[]): string {
  const occurrence = beats.slice(0, index + 1).filter((item) => item === beat).length;
  const total = beats.filter((item) => item === beat).length;
  return total > 1 ? `${beat} ${occurrence}` : beat;
}

function durations(totalMs: number, count: number): number[] {
  const base = Math.floor(totalMs / count);
  const values = Array.from({ length: count }, () => base);
  values[count - 1] = totalMs - base * (count - 1);
  return values;
}

export function mockScript(input: ScriptGenInput): ScriptGenOutput {
  const genre = getGenre(input.genre);
  const topic = stripBlockedNames(topicOf(input.brief, genre.defaultTopic)) || genre.defaultTopic;
  const product = stripBlockedNames(productOf(input.brief, genre.defaultProduct ?? "the product")) || "the product";
  const normalized = normalizeTopic(topic);
  const library = libraryLines(input.genre, input.language, normalized, normalizeTopic(product));
  const lines = library ?? genericLines(input.genre, input.language, topic, product);
  const feedback = feedbackOf(input.feedback);
  const count = sceneCountOf(input.brief);
  const beats = Array.from({ length: count }, (_, index) => genre.beats[index % genre.beats.length]!);
  const timing = durations(input.targetSeconds * 1000, count);
  const outOfRange =
    input.targetSeconds < genre.minSeconds || input.targetSeconds > genre.maxSeconds;
  const castRequest = Boolean(input.brief.notes?.includes("cast_request:"));

  return {
    scenes: beats.map((beat, index) => {
      const castIds = sceneCastIds(input.cast, beat, index);
      const doubts: string[] = [];
      if (index === beats.length - 1) doubts.push(EDITORIAL[input.genre]);
      if (index === 0 && outOfRange) doubts.push("Length is outside the usual range for this genre.");
      if (index === 0 && castRequest) {
        doubts.push("A new character was requested and is not in the cast bank yet.");
      }
      if (castIds.length === 0) doubts.push("No cast member is attached to this scene.");
      let narration = lines[index] ?? lines[lines.length - 1] ?? topic;
      if (feedback) {
        const quoted = feedback.match(/(?:say|replace.*?with|opening.*?:)\s*["“]([^"”]+)["”]/i)?.[1];
        if (index === 0 && quoted) narration = stripBlockedNames(quoted);
        else if (/simple|simpler|short|easy|easier/i.test(feedback)) {
          narration = narration.split(/(?<=[.!?।])\s+/)[0] ?? narration;
          if (index === 0) narration = input.language === "hi" ? "क्या आपने कभी सोचा है? आओ, मिलकर पता करें!" : input.language === "hinglish" ? "Kabhi socha aisa kyun hota hai? Chalo, pata karein!" : "Ever wondered why? Let’s find out together!";
        } else if (index === 0) {
          narration = input.language === "hi" ? `ज़रा सोचो! ${narration}` : input.language === "hinglish" ? `Socho zara! ${narration}` : `Picture this! ${narration}`;
        }
      }
      return {
        idx: index,
        title: titleFor(beat, index, beats),
        narration,
        durationMs: timing[index] ?? 1000,
        doubts,
        castIds,
      };
    }),
  };
}

/** Keep the first `count` scenes and rescale so durations match the brief. */
export function fitScriptScenes(
  output: ScriptGenOutput,
  count: number,
  targetSeconds: number,
): ScriptGenOutput {
  if (output.scenes.length < count) {
    throw new Error(`Expected ${count} scenes.`);
  }
  const timing = durations(targetSeconds * 1000, count);
  return {
    ...output,
    scenes: output.scenes.slice(0, count).map((scene, index) => ({
      ...scene,
      idx: index,
      durationMs: timing[index] ?? 1000,
    })),
  };
}

export function assertScriptRules(input: ScriptGenInput, output: ScriptGenOutput): void {
  const count = sceneCountOf(input.brief);
  if (output.scenes.length !== count) {
    throw new Error(`Expected ${count} scenes.`);
  }
  const allowed = new Set(input.cast.map((member) => member.id));
  const sum = output.scenes.reduce((total, scene) => total + scene.durationMs, 0);
  if (sum !== input.targetSeconds * 1000) {
    throw new Error("Scene durations must add up to targetSeconds.");
  }
  for (const scene of output.scenes) {
    for (const id of scene.castIds) {
      if (!allowed.has(id)) throw new Error(`Unknown cast id ${id}.`);
    }
    if (/pixar|disney|ghibli/i.test(scene.narration)) {
      throw new Error("Narration contains a blocked studio or artist name.");
    }
  }
}

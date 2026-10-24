import type { CastMember, Genre, PromptGenInput, PromptGenOutput } from "@chotu/shared";
import { artStylePreset, getGenre } from "../genres/load.js";
import { stripBlockedNames } from "../intake/art-style.js";
import { productOf, topicOf } from "../intake/notes.js";

const PACE: Record<Genre, string> = {
  kids: "gentle and readable, no sudden cuts",
  ad: "snappy, one idea in the shot",
  faceless: "steady documentary pace",
};

const VISUAL: Record<Genre, string[]> = {
  kids: [
    "{{people}} lean toward a small friendly object that shows {{topic}}, on a low table, curious and safe.",
    "One clear example of {{topic}} with one or two everyday props, uncluttered.",
    "A closer look at the middle step of {{topic}}, still bright and calm.",
    "A memory game on the floor about {{topic}}, no writing anywhere.",
    "A cheerful pause for a quiz about {{topic}}, ready to answer, no letters in frame.",
  ],
  ad: [
    "The presenter mid greeting in a small shop, before the product appears.",
    "The presenter sets aside a disappointing stand-in for {{product}}.",
    "{{product}} centred on a clean surface, label area blank, true colour.",
    "The presenter beside {{product}}, a friendly offer gesture, no price text.",
    "The presenter looks to camera with {{product}} in frame, a clear stop, no letters.",
  ],
  faceless: [
    "No person. A wide view that shows {{topic}}, natural light, empty of faces.",
    "No person. A closer natural detail that explains {{topic}}.",
    "No person. The cause of {{topic}} shown as landscape, weather, or objects.",
    "No person. A simple comparison that makes {{topic}} easy to follow.",
    "No person. A quiet final image that lands {{topic}}, still with no face.",
  ],
};

function cameraFor(title: string): string {
  const beat = title.split(" ")[0] ?? title;
  switch (beat) {
    case "hook":
      return "slow push-in";
    case "product":
      return "slow arc around the product";
    case "cta":
    case "quiz":
      return "locked medium shot with a small nod";
    case "payoff":
      return "slow pull-back";
    default:
      return "locked medium shot";
  }
}

function styleTraits(input: PromptGenInput): string[] {
  if (input.brief.artStyleTraits && input.brief.artStyleTraits.length > 0) {
    return input.brief.artStyleTraits.map((trait) => stripBlockedNames(trait)).filter(Boolean);
  }
  const genre = input.brief.genre ?? "kids";
  const preset = input.brief.artStyle ? artStylePreset(genre, input.brief.artStyle) : undefined;
  if (preset) return preset.traits;
  const config = getGenre(genre);
  return (
    config.artStylePresets.find((item) => item.id === config.defaultArtStyle)?.traits ?? [
      "simple illustrated look",
    ]
  );
}

function relevantCast(input: PromptGenInput): CastMember[] {
  if (input.scene.castIds.length === 0) return input.cast;
  const ids = new Set(input.scene.castIds);
  const matched = input.cast.filter((member) => ids.has(member.id));
  return matched.length > 0 ? matched : input.cast;
}

export function elementToken(elementId: string): string {
  return `<<<${elementId}>>>`;
}

function visualLine(input: PromptGenInput, onScreen: readonly CastMember[]): string {
  const genre = input.brief.genre ?? "kids";
  const config = getGenre(genre);
  const template = VISUAL[genre][input.scene.idx] ?? VISUAL[genre][0] ?? "";
  const people =
    onScreen.length >= 2 ? "Two children" : (onScreen[0]?.name ?? "A child");
  const topic = stripBlockedNames(topicOf(input.brief, config.defaultTopic)) || config.defaultTopic;
  const product =
    stripBlockedNames(productOf(input.brief, config.defaultProduct ?? "the product")) || "the product";
  return template
    .replaceAll("{{people}}", people)
    .replaceAll("{{topic}}", topic)
    .replaceAll("{{product}}", product);
}

export function mockPrompts(input: PromptGenInput): PromptGenOutput {
  const cast = relevantCast(input);
  const visible = cast.filter((member) => member.role !== "narrator");
  const narrators = cast.filter((member) => member.role === "narrator");
  const identities = (visible.length > 0 ? visible : narrators).map((member) => member.identityText);
  const elementIds = visible
    .map((member) => member.higgsfieldElementId)
    .filter((id): id is string => Boolean(id));
  const tokens = elementIds.map((id) => elementToken(id));
  const genre = input.brief.genre ?? "kids";
  const ratio = input.brief.aspectRatio ?? "9:16";
  const traits = styleTraits(input);
  const action = [visualLine(input, visible), input.feedback ? `Visual revision: ${stripBlockedNames(input.feedback)}` : ""].filter(Boolean).join(" ");
  const shared = [
    ...identities,
    ...tokens,
    "AI-generated scene.",
  ];
  const imagePrompt = [
    `${traits.join(", ")}.`,
    `One still frame, aspect ${ratio}, no text, no letters, no logo, no watermark.`,
    action,
    ...shared,
  ].join(" ");
  const videoPrompt = [
    "Motion continues from the still.",
    action,
    `Camera: ${cameraFor(input.scene.title ?? "scene")}. Pace: ${PACE[genre]}.`,
    `Duration ${input.scene.durationMs ?? 1000} milliseconds.`,
    "No burned-in text.",
    ...shared,
  ].join(" ");
  return { imagePrompt, videoPrompt, elementIds };
}

export function assertPromptRules(input: PromptGenInput, output: PromptGenOutput): void {
  const cast = relevantCast(input);
  const visible = cast.filter((member) => member.role !== "narrator");
  const narrators = cast.filter((member) => member.role === "narrator");
  for (const member of visible) {
    if (!output.imagePrompt.includes(member.identityText) || !output.videoPrompt.includes(member.identityText)) {
      throw new Error(`Prompt dropped the identity for ${member.name}.`);
    }
    if (!member.higgsfieldElementId) continue;
    const token = elementToken(member.higgsfieldElementId);
    if (!output.imagePrompt.includes(token) || !output.videoPrompt.includes(token)) {
      throw new Error(`Prompt is missing ${token}.`);
    }
    if (!output.elementIds.includes(member.higgsfieldElementId)) {
      throw new Error(`elementIds is missing ${member.higgsfieldElementId}.`);
    }
  }
  if (visible.length === 0) {
    if (output.elementIds.length > 0) throw new Error("A narrator-only scene must not embed element ids.");
    if (narrators[0] && !output.imagePrompt.includes(narrators[0].identityText)) {
      throw new Error("Narrator identity is missing from the image prompt.");
    }
  }
  if (/pixar|disney|ghibli|dreamworks/i.test(output.imagePrompt) || /pixar|disney|ghibli|dreamworks/i.test(output.videoPrompt)) {
    throw new Error("Prompt contains a blocked studio or artist name.");
  }
  if (!output.imagePrompt.includes("AI-generated scene.") || !output.videoPrompt.includes("AI-generated scene.")) {
    throw new Error("Prompt is missing the AI-generated label.");
  }
}

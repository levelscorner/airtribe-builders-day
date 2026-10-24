import type { Brief } from "@chotu/shared";
import { z } from "zod";
import { applyAnswer, type IntakeAnswer } from "../creative/intake/intake.js";
import type { IntakeQuestion } from "../creative/schema.js";
import { BriefSchema, IntakeQuestionSchema, parseBrief } from "../creative/schema.js";
import { completeClaudeJson, type ClaudeJsonInput } from "./claude.js";
import { resolveLlmProvider } from "./provider.js";

type ClaudeDeps = Pick<ClaudeJsonInput, "fetchImpl" | "apiKey" | "model">;

const ValueSchema = z.object({ value: z.string().min(1) });

export function claudeIntakeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveLlmProvider(env) === "claude";
}

/** Rewrite the next fixed question. Field and chip ids stay ones the intake parser accepts. */
export async function claudeQuestion(
  brief: Brief,
  fallback: IntakeQuestion,
  deps?: ClaudeDeps,
): Promise<IntakeQuestion> {
  const optionIds = (fallback.options ?? []).map((option) => option.id);
  const raw = await completeClaudeJson({
    system: [
      "Write one clarifying question for a short-video brief.",
      `The field must be "${fallback.field}".`,
      optionIds.length > 0 ? `Option ids must be from: ${optionIds.join(", ")}.` : "No options.",
      "Ask about genre, language (Hindi, Hinglish, or English), length, resolution, audience, art style, or cast — whichever field this is.",
      "Keep the prompt short.",
    ].join(" "),
    prompt: JSON.stringify({ brief, question: fallback }),
    schema: IntakeQuestionSchema,
    schemaHint:
      '{"field":"","prompt":"","options":[{"id":"","label":""}],"allowFreeText":true,"allowSkip":true,"allowDefaults":true}',
    ...deps,
  });
  const parsed = IntakeQuestionSchema.parse(raw);
  if (parsed.field !== fallback.field || !parsed.prompt.trim()) return fallback;
  const allowed = new Set(optionIds);
  const options = parsed.options?.filter((option) => allowed.has(option.id));
  return {
    ...fallback,
    prompt: parsed.prompt,
    options: options && options.length > 0 ? options : fallback.options,
  };
}

/** Map a free-text answer onto the Brief field the chat just asked. */
export async function claudeParseFreeText(
  brief: Brief,
  answer: IntakeAnswer,
  deps?: ClaudeDeps,
): Promise<{ brief: Brief; error?: string }> {
  const raw = await completeClaudeJson({
    system: [
      `Extract one value for brief field "${answer.field}".`,
      "genre is kids, ad, or faceless.",
      "language is hi (Hindi), hinglish (Hinglish), or en (English).",
      "resolution is 720p or 1080p.",
      "targetSeconds is a whole number of seconds.",
      "aspectRatio looks like 9:16.",
      "cast is a preset id or a name.",
      'Return {"value":"..."} only.',
    ].join(" "),
    prompt: JSON.stringify({ field: answer.field, text: answer.freeText ?? "", brief }),
    schema: ValueSchema,
    schemaHint: '{"value":""}',
    ...deps,
  });
  const value = normalizeValue(answer.field, ValueSchema.parse(raw).value);
  const viaModel = applyAnswer(brief, { field: answer.field, optionId: value });
  if (!viaModel.error) return viaModel;
  return applyAnswer(brief, answer);
}

/** Pull topic and any obvious brief fields out of the opening chat line. */
export async function claudeOpeningBrief(text: string, fallback: Brief, deps?: ClaudeDeps): Promise<Brief> {
  const raw = await completeClaudeJson({
    system: [
      "Read a creator's opening line and fill a video brief.",
      "genre: kids, ad, or faceless.",
      "language: hi, hinglish, or en.",
      "resolution: 720p or 1080p.",
      "Omit fields you cannot tell.",
    ].join(" "),
    prompt: text,
    schema: BriefSchema,
    schemaHint:
      '{"topic":"","genre":"kids|ad|faceless","language":"hi|hinglish|en","resolution":"720p|1080p","targetSeconds":45,"audience":"","artStyle":"","castIds":[]}',
    ...deps,
  });
  return parseBrief({ ...fallback, ...defined(parseBrief(raw)) });
}

function defined(brief: Brief): Brief {
  const next: Brief = {};
  if (brief.topic) next.topic = brief.topic;
  if (brief.genre) next.genre = brief.genre;
  if (brief.language) next.language = brief.language;
  if (brief.aspectRatio) next.aspectRatio = brief.aspectRatio;
  if (brief.resolution) next.resolution = brief.resolution;
  if (typeof brief.targetSeconds === "number") next.targetSeconds = brief.targetSeconds;
  if (brief.audience) next.audience = brief.audience;
  if (brief.artStyle) next.artStyle = brief.artStyle;
  if (brief.artStyleTraits?.length) next.artStyleTraits = brief.artStyleTraits;
  if (brief.castIds?.length) next.castIds = brief.castIds;
  return next;
}

function normalizeValue(field: string, value: string): string {
  const text = value.trim();
  const lower = text.toLowerCase();
  if (field === "language") {
    if (lower === "hi" || lower === "hindi") return "hi";
    if (lower.includes("hinglish")) return "hinglish";
    if (lower === "en" || lower === "english") return "en";
  }
  if (field === "genre") {
    if (lower.includes("kid")) return "kids";
    if (lower === "ad" || lower.includes("advert")) return "ad";
    if (lower.includes("faceless")) return "faceless";
  }
  if (field === "resolution") {
    if (lower.includes("720")) return "720p";
    if (lower.includes("1080")) return "1080p";
  }
  return text;
}

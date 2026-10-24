import type { Brief, Genre, PostMessageRequest, QuestionMessage } from "@chotu/shared";
import { artStylePreset, GENRE_ORDER, getGenre, getPreset, getPresetCast, getPresets } from "../genres/load.js";
import type { ArtStylePreset, IntakeQuestion } from "../schema.js";
import { parseBrief } from "../schema.js";
import { stripBlockedNames, traitsFromArtText } from "./art-style.js";
import { markSkipped, noteValue, skippedFields, upsertNote } from "./notes.js";

export type IntakeAnswer = NonNullable<PostMessageRequest["answer"]>;

const KIDS_HINT = /\b(kid|kids|child|children|learn|school|quiz|tutor|bachch|bacch|padh|edu)\b/i;
const AD_HINT = /\b(ad|ads|advert|sale|offer|shop|brand|product|dukaan|d2c|cta)\b/i;
const FACELESS_HINT = /\b(faceless|facts?|story|motivat|documentary|narrat)\b/i;

export function guessGenre(text: string): Genre | undefined {
  const hits: Genre[] = [];
  if (KIDS_HINT.test(text)) hits.push("kids");
  if (AD_HINT.test(text)) hits.push("ad");
  if (FACELESS_HINT.test(text)) hits.push("faceless");
  return hits.length === 1 ? hits[0] : undefined;
}

export function briefFromMessage(text: string): Brief {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return parseBrief({
    genre: trimmed ? guessGenre(trimmed) : undefined,
    notes: trimmed ? upsertNote(undefined, "topic", trimmed) : undefined,
  });
}

function findArtPreset(id: string): ArtStylePreset | undefined {
  for (const genre of GENRE_ORDER) {
    const preset = artStylePreset(genre, id);
    if (preset) return preset;
  }
  return undefined;
}

function normalizeGenre(raw: string): Genre | undefined {
  const text = raw.trim().toLowerCase();
  if (text === "kids" || text === "kid" || text.includes("edu")) return "kids";
  if (text === "ad" || text === "ads" || text.includes("advert")) return "ad";
  if (text.includes("faceless")) return "faceless";
  return guessGenre(raw);
}

function genreQuestion(brief: Brief): IntakeQuestion {
  const guessed = brief.genre ? getGenre(brief.genre) : undefined;
  return {
    field: "genre",
    prompt: guessed
      ? `This sounds like a ${guessed.label} short. Keep that, or pick another?`
      : "Which kind of short is this?",
    options: [
      { id: "kids", label: "Kids edu-fun" },
      { id: "ad", label: "Ad" },
      { id: "faceless", label: "Faceless" },
    ],
    allowFreeText: true,
    allowSkip: Boolean(guessed),
    allowDefaults: true,
  };
}

function castQuestion(genreId: Genre): IntakeQuestion {
  const genre = getGenre(genreId);
  const members = getPresets(genre.defaultCastIds);
  const options = members.map((member) => ({
    id: member.id,
    label: member.role === "narrator" ? `${member.name} (no one on screen)` : member.name,
  }));
  if (genreId === "kids" && members.length > 1) {
    options.unshift({
      id: members.map((member) => member.id).join(","),
      label: members.map((member) => member.name).join(" and "),
    });
  }
  return {
    field: "cast_ids",
    prompt:
      genreId === "faceless"
        ? "Faceless videos keep the narrator off screen. Use that, or type a name to request someone new?"
        : "Who is on screen? Pick a preset, or type a name to request a new character.",
    options,
    allowFreeText: true,
    allowSkip: true,
    allowDefaults: true,
  };
}

function fixedQuestions(genreId: Genre): IntakeQuestion[] {
  const genre = getGenre(genreId);
  const lengths = [...new Set([genre.minSeconds, genre.defaultTargetSeconds, genre.maxSeconds])];
  return [
    {
      field: "resolution",
      prompt: "What resolution should we render?",
      options: [
        { id: "720p", label: "720p" },
        { id: "1080p", label: "1080p" },
      ],
      allowSkip: true,
      allowDefaults: true,
    },
    {
      field: "aspect_ratio",
      prompt: "What frame shape? Vertical is the usual pick.",
      options: [
        { id: "9:16", label: "Vertical 9:16" },
        { id: "1:1", label: "Square 1:1" },
        { id: "16:9", label: "Wide 16:9" },
      ],
      allowSkip: true,
      allowDefaults: true,
    },
    {
      field: "target_seconds",
      prompt: `How long should it be? ${genre.label} usually sits between ${genre.minSeconds} and ${genre.maxSeconds} seconds.`,
      options: lengths.map((seconds) => ({ id: String(seconds), label: `${seconds} seconds` })),
      allowFreeText: true,
      allowSkip: true,
      allowDefaults: true,
    },
    {
      field: "language",
      prompt: "Which language should the narration use?",
      options: [
        { id: "hi", label: "Hindi" },
        { id: "hinglish", label: "Hinglish" },
        { id: "en", label: "English" },
      ],
      allowSkip: true,
      allowDefaults: true,
    },
    {
      field: "audience",
      prompt: "Who is this for?",
      options: [{ id: genre.defaultAudience, label: genre.defaultAudience }],
      allowFreeText: true,
      allowSkip: true,
      allowDefaults: true,
    },
    {
      field: "art_style",
      prompt: "What art style? Pick a preset or describe the look in plain words. Skip artist and brand names.",
      options: genre.artStylePresets.map((preset) => ({ id: preset.id, label: preset.label })),
      allowFreeText: true,
      allowSkip: true,
      allowDefaults: true,
    },
    castQuestion(genreId),
  ];
}

function isAnswered(brief: Brief, field: string): boolean {
  if (skippedFields(brief.notes).has(field)) return true;
  switch (field) {
    case "genre":
      return Boolean(brief.genre);
    case "topic":
      return Boolean(noteValue(brief.notes, "topic"));
    case "product":
      return Boolean(noteValue(brief.notes, "product"));
    case "resolution":
      return Boolean(brief.resolution);
    case "aspect_ratio":
      return Boolean(brief.aspectRatio);
    case "target_seconds":
      return typeof brief.targetSeconds === "number";
    case "language":
      return Boolean(brief.language);
    case "audience":
      return Boolean(brief.audience);
    case "art_style":
      return Boolean(brief.artStyle);
    case "cast_ids":
      return brief.castIds !== undefined;
    default:
      return false;
  }
}

export function questionsFor(brief: Brief): IntakeQuestion[] {
  const questions: IntakeQuestion[] = [genreQuestion(brief)];
  if (!brief.genre) return questions;
  const genre = getGenre(brief.genre);
  const topic = genre.followUps.find((question) => question.field === "topic");
  if (topic) questions.push(topic);
  questions.push(...fixedQuestions(brief.genre));
  for (const followUp of genre.followUps) {
    if (followUp.field !== "topic") questions.push(followUp);
  }
  return questions;
}

export function nextQuestion(brief: Brief): IntakeQuestion | null {
  return questionsFor(brief).find((question) => !isAnswered(brief, question.field)) ?? null;
}

function parseSeconds(raw: string): number | undefined {
  const match = /(\d{1,2})/.exec(raw);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : undefined;
}

function fillField(brief: Brief, field: string, raw: string): { brief: Brief; error?: string } {
  const genre = brief.genre ? getGenre(brief.genre) : undefined;
  const useDefault = raw === "default";

  switch (field) {
    case "genre": {
      const id = useDefault ? (brief.genre ?? "kids") : normalizeGenre(raw);
      if (!id) return { brief, error: "Pick kids, ad, or faceless." };
      return { brief: { ...brief, genre: id } };
    }
    case "resolution": {
      const value = useDefault ? (genre?.defaultResolution ?? "1080p") : raw;
      if (value !== "720p" && value !== "1080p") {
        return { brief, error: "Resolution is 720p or 1080p." };
      }
      return { brief: { ...brief, resolution: value } };
    }
    case "aspect_ratio": {
      const value = useDefault ? (genre?.defaultAspectRatio ?? "9:16") : raw;
      if (!/^\d{1,2}:\d{1,2}$/.test(value)) return { brief, error: "Use a ratio like 9:16." };
      return { brief: { ...brief, aspectRatio: value } };
    }
    case "target_seconds": {
      const value = useDefault ? (genre?.defaultTargetSeconds ?? 45) : parseSeconds(raw);
      if (value === undefined || value < 5 || value > 60) {
        return { brief, error: "Length must be a whole number of seconds, up to 60." };
      }
      return { brief: { ...brief, targetSeconds: value } };
    }
    case "language": {
      const value = useDefault ? (genre?.defaultLanguage ?? "hinglish") : raw.trim().toLowerCase();
      if (value !== "hi" && value !== "hinglish" && value !== "en") {
        return { brief, error: "Language is Hindi, Hinglish, or English." };
      }
      return { brief: { ...brief, language: value } };
    }
    case "audience": {
      const value = useDefault ? (genre?.defaultAudience ?? "a general audience") : raw.trim();
      return { brief: { ...brief, audience: value.slice(0, 200) } };
    }
    case "art_style": {
      if (useDefault) {
        const id = genre?.defaultArtStyle ?? "bright-2d-cartoon";
        const preset = findArtPreset(id);
        return { brief: { ...brief, artStyle: id, artStyleTraits: preset?.traits } };
      }
      const preset = findArtPreset(raw);
      if (preset) return { brief: { ...brief, artStyle: preset.id, artStyleTraits: preset.traits } };
      const parsed = traitsFromArtText(raw);
      return { brief: { ...brief, artStyle: parsed.artStyle, artStyleTraits: parsed.artStyleTraits } };
    }
    case "cast_ids": {
      if (useDefault) return { brief: { ...brief, castIds: genre?.defaultCastIds ?? [] } };
      const byName = getPresetCast().find((member) => member.name.toLowerCase() === raw.toLowerCase());
      const tokens = (byName ? [byName.id] : raw.split(",").map((token) => token.trim()).filter(Boolean));
      if (tokens.length > 0 && tokens.every((id) => getPreset(id))) {
        return { brief: { ...brief, castIds: tokens } };
      }
      return {
        brief: {
          ...brief,
          castIds: genre?.defaultCastIds ?? [],
          notes: upsertNote(brief.notes, "cast_request", raw),
        },
      };
    }
    case "topic": {
      const value = useDefault ? (genre?.defaultTopic ?? "a short video") : raw.trim();
      return { brief: { ...brief, notes: upsertNote(brief.notes, "topic", value.slice(0, 200)) } };
    }
    case "product": {
      const source = useDefault ? (genre?.defaultProduct ?? "the product") : raw;
      const cleaned = stripBlockedNames(source);
      const value = cleaned.length > 0 ? cleaned.slice(0, 200) : (genre?.defaultProduct ?? "the product");
      return { brief: { ...brief, notes: upsertNote(brief.notes, "product", value) } };
    }
    default:
      return { brief, error: `Unknown question field ${field}.` };
  }
}

export function applyAnswer(brief: Brief, answer: IntakeAnswer): { brief: Brief; error?: string } {
  if (!answer.field.trim()) return { brief, error: "Missing question field." };
  if (answer.skip || answer.useDefaults) {
    const filled = fillField(brief, answer.field, "default");
    if (filled.error || !answer.skip) return filled;
    return { brief: { ...filled.brief, notes: markSkipped(filled.brief.notes, answer.field) } };
  }
  const raw = (answer.optionId ?? answer.freeText ?? "").trim();
  if (!raw) return { brief, error: "Choose an option, type an answer, or skip." };
  return fillField(brief, answer.field, raw);
}

export function applyDefaults(brief: Brief): Brief {
  let next = brief.genre ? brief : fillField(brief, "genre", "default").brief;
  for (const question of questionsFor(next)) {
    if (!isAnswered(next, question.field)) {
      const filled = fillField(next, question.field, "default");
      if (!filled.error) next = filled.brief;
    }
  }
  return next;
}

export function toQuestionMessage(
  question: IntakeQuestion,
  envelope: { id: string; chatId: string; createdAt: string },
): QuestionMessage {
  return {
    kind: "question",
    role: "assistant",
    ...envelope,
    field: question.field,
    prompt: question.prompt,
    options: question.options,
    allowFreeText: question.allowFreeText,
    allowSkip: question.allowSkip,
    allowDefaults: question.allowDefaults,
  };
}

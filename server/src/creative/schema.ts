/**
 * Zod checks for creative payloads.
 * The contract types live in @chotu/shared. These schemas parse unknown
 * JSON into those types; they do not declare a second contract.
 */
import { z } from "zod";
import type {
  Brief,
  CastMember,
  Genre,
  PromptGenOutput,
  QuestionOption,
  ScriptGenOutput,
} from "@chotu/shared";

export const GenreSchema = z.enum(["kids", "ad", "faceless"]);
export const LanguageSchema = z.enum(["hi", "hinglish", "en"]);
export const ResolutionSchema = z.enum(["720p", "1080p"]);
export const CastRoleSchema = z.enum([
  "mascot",
  "presenter",
  "hero",
  "product",
  "narrator",
]);
export const CastStatusSchema = z.enum(["draft", "approved", "archived"]);

export const QuestionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

/** Question body the orchestrator wraps in a shared QuestionMessage. */
export const IntakeQuestionSchema = z.object({
  field: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(QuestionOptionSchema).optional(),
  allowFreeText: z.boolean().optional(),
  allowSkip: z.boolean().optional(),
  allowDefaults: z.boolean().optional(),
});
export type IntakeQuestion = z.infer<typeof IntakeQuestionSchema>;

export const ArtStylePresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  traits: z.array(z.string().min(1)).min(2).max(8),
});
export type ArtStylePreset = z.infer<typeof ArtStylePresetSchema>;

export const GenreConfigSchema = z
  .object({
    id: GenreSchema,
    label: z.string().min(1),
    who: z.string().min(1),
    tone: z.string().min(1),
    shape: z.string().min(1),
    beats: z.array(z.string().min(1)).min(4).max(6),
    defaultTargetSeconds: z.number().int().positive().max(60),
    minSeconds: z.number().int().positive().max(60),
    maxSeconds: z.number().int().positive().max(60),
    defaultResolution: ResolutionSchema,
    defaultAspectRatio: z.string().min(3),
    defaultLanguage: LanguageSchema,
    defaultAudience: z.string().min(1),
    defaultTopic: z.string().min(1),
    defaultProduct: z.string().min(1).optional(),
    artStylePresets: z.array(ArtStylePresetSchema).min(1),
    defaultArtStyle: z.string().min(1),
    defaultCastIds: z.array(z.string().min(1)).min(1),
    captionStyle: z.string().min(1),
    followUps: z.array(IntakeQuestionSchema),
    skillRefs: z.array(z.string().min(1)).min(1),
  })
  .superRefine((config, ctx) => {
    if (config.minSeconds > config.defaultTargetSeconds || config.defaultTargetSeconds > config.maxSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "defaultTargetSeconds must sit inside minSeconds..maxSeconds",
        path: ["defaultTargetSeconds"],
      });
    }
    if (!config.artStylePresets.some((preset) => preset.id === config.defaultArtStyle)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "defaultArtStyle must be one of artStylePresets",
        path: ["defaultArtStyle"],
      });
    }
  });
export type GenreConfig = z.infer<typeof GenreConfigSchema>;

export const BriefSchema = z.object({
  genre: GenreSchema.optional(),
  language: LanguageSchema.optional(),
  aspectRatio: z.string().min(3).optional(),
  resolution: ResolutionSchema.optional(),
  targetSeconds: z.number().int().positive().max(60).optional(),
  audience: z.string().min(1).optional(),
  artStyle: z.string().min(1).optional(),
  artStyleTraits: z.array(z.string().min(1)).optional(),
  castIds: z.array(z.string().min(1)).optional(),
  notes: z.string().optional(),
});

export const CastMemberSchema = z.object({
  id: z.string().min(1),
  ownerUserId: z.string().min(1).optional(),
  name: z.string().min(1),
  role: CastRoleSchema,
  identityText: z.string().min(1),
  dnaChips: z.array(z.string().min(1)).min(4).max(6),
  artStyle: z.string().min(1).optional(),
  sheetUrl: z.string().min(1).optional(),
  anchorUrl: z.string().min(1).optional(),
  higgsfieldElementId: z.string().min(1).optional(),
  voiceId: z.string().min(1).optional(),
  version: z.number().int().positive(),
  status: CastStatusSchema,
  isPreset: z.boolean(),
});

export const ScriptSceneSchema = z.object({
  idx: z.number().int().nonnegative(),
  title: z.string().min(1),
  narration: z.string().min(1),
  durationMs: z.number().int().positive(),
  doubts: z.array(z.string()),
  castIds: z.array(z.string()),
});

export const ScriptGenOutputSchema = z.object({
  scenes: z.array(ScriptSceneSchema).min(1),
  rawMarkdown: z.string().optional(),
});

export const PromptGenOutputSchema = z.object({
  imagePrompt: z.string().min(1),
  videoPrompt: z.string().min(1),
  elementIds: z.array(z.string()),
});

export function parseGenre(input: unknown): Genre {
  return GenreSchema.parse(input);
}

export function parseBrief(input: unknown): Brief {
  return BriefSchema.parse(input);
}

export function parseCastMember(input: unknown): CastMember {
  return CastMemberSchema.parse(input);
}

export function parseScriptGenOutput(input: unknown): ScriptGenOutput {
  return ScriptGenOutputSchema.parse(input);
}

export function parsePromptGenOutput(input: unknown): PromptGenOutput {
  return PromptGenOutputSchema.parse(input);
}

export function parseQuestionOption(input: unknown): QuestionOption {
  return QuestionOptionSchema.parse(input);
}

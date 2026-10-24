/**
 * Venus creative module (docs/14, server/src/creative).
 *
 * Import contract types from @chotu/shared. This folder does not redeclare them.
 *
 * Assumptions until Saturn extends the contract:
 * - Topic, product description, skipped fields, and regenerate feedback live in
 *   Brief.notes as `key: value` lines. Brief has no topic or feedback field.
 * - Question field keys are snake_case (aspect_ratio, target_seconds, art_style,
 *   cast_ids), matching the architecture examples. applyAnswer maps them onto Brief.
 * - Preset cast ids (preset_chintu, …) and higgsfield element ids are fixtures
 *   until the S2 seed and Neptune's cast bank exist. Generators use the CastMember[]
 *   they are given.
 * - Scene idx is 0-based.
 * - Approve / reject / credit preview stay on the orchestrator (S4). Regenerate
 *   feedback is applied by calling ScriptGen / PromptGen again with notes updated.
 * - chotu-craft skills load from CHOTU_CRAFT_ROOT, server/vendor/chotu-craft, or
 *   ../chotu-craft. Missing files are skipped. Skill text is system-prompt only.
 */
export {
  ArtStylePresetSchema,
  BriefSchema,
  CastMemberSchema,
  GenreConfigSchema,
  GenreSchema,
  IntakeQuestionSchema,
  LanguageSchema,
  PromptGenOutputSchema,
  ResolutionSchema,
  ScriptGenOutputSchema,
  ScriptSceneSchema,
  parseBrief,
  parseCastMember,
  parseGenre,
  parsePromptGenOutput,
  parseScriptGenOutput,
} from "./schema.js";
export type { ArtStylePreset, GenreConfig, IntakeQuestion } from "./schema.js";
export {
  GENRE_ORDER,
  artStylePreset,
  getGenre,
  getGenres,
  getPreset,
  getPresetCast,
  getPresets,
} from "./genres/load.js";
export { stripBlockedNames, traitsFromArtText } from "./intake/art-style.js";
export {
  applyAnswer,
  applyDefaults,
  briefFromMessage,
  guessGenre,
  nextQuestion,
  questionsFor,
  toQuestionMessage,
} from "./intake/intake.js";
export type { IntakeAnswer } from "./intake/intake.js";
export {
  feedbackOf,
  noteValue,
  productOf,
  topicOf,
  withFeedback,
} from "./intake/notes.js";

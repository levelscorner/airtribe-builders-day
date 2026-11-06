import type { CastMember } from "../../../../packages/shared/types.ts";
import type { FetchLike } from "../ark/client.js";
import { anchorUrlFromElementId, elementIdForAnchor } from "./reference.js";
import type { EnvLike } from "../flags.js";
import { moduleMock } from "../flags.js";
import { FACE_SHEET_LINE, generateCharacterSheet } from "../openai/images.js";
import { mockAssets, publicUrl } from "../placeholders.js";

export interface SheetDeps {
  fetch?: FetchLike;
  saveSheet?: (castId: string, sheetUrl: string) => Promise<void>;
  /** Video look: style label and traits, already joined. */
  visualStyle?: string;
}

/** Scene edits attach at most this many character sheets, ahead of other refs. */
export const MAX_SCENE_SHEETS = 4;

const SHEET_BLOCK =
  "CHARACTER SHEET — professional model/reference sheet, multiple consistent views of the SAME subject: front view, 3/4 view, side profile, back view, plus close-up detail panels (face/key features, materials/textures, signature props). Neutral background, even lighting, no scene.";

const NO_TEXT = "No text, no captions, no labels.";

export interface SceneCastReference {
  prompt: string;
  elementIds: string[];
}

/**
 * Four blocks: sheet layout, visual style, subject (name, role, look, DNA), no text.
 * No expression row. Pass useFaceAnchor only when the sheet is an edits call.
 */
export function characterSheetPrompt(
  member: Pick<CastMember, "name" | "role" | "identityText" | "dnaChips" | "artStyle">,
  visualStyle?: string,
  useFaceAnchor = false,
): string {
  const name = member.name.trim() || "Subject";
  const role = member.role.trim() || "character";
  const look = member.identityText.trim() || name;
  const dna = member.dnaChips
    .map((chip) => chip.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" · ");
  const style = visualStyle?.trim() || member.artStyle?.trim() || "the video's look";
  return [
    SHEET_BLOCK,
    `VISUAL STYLE: ${style}`,
    `SUBJECT: ${name}, ${role}. Look: ${look}. DNA: ${dna}`.trim(),
    useFaceAnchor ? FACE_SHEET_LINE : "",
    NO_TEXT,
  ]
    .filter(Boolean)
    .join("\n");
}

export function sheetsAreMock(env: EnvLike): boolean {
  if (moduleMock(env, "IMAGE_MOCK")) return true;
  if ((env.IMAGE_PROVIDER ?? "").trim().toLowerCase() === "mock") return true;
  if (env.OPENAI_API_KEY?.trim()) return false;
  return env.IMAGE_MOCK?.trim() !== "0";
}

/**
 * One sheet per cast member, from text (gpt-image-2 generations).
 * A stored sheetUrl is reused. Narrators have no face, so they get no sheet.
 * The face anchor stays a separate reference. Edits are only used when a caller
 * passes an anchor into generateCharacterSheet, and that prompt includes FACE_SHEET_LINE.
 */
export async function ensureCharacterSheet(
  env: EnvLike,
  member: CastMember,
  deps: SheetDeps = {},
): Promise<string | undefined> {
  if (member.role === "narrator") return undefined;
  const existing = member.sheetUrl?.trim();
  if (existing) return existing;
  const url = sheetsAreMock(env)
    ? publicUrl(env, `${mockAssets.keyframe}?cast=${encodeURIComponent(member.id)}`)
    : await generateCharacterSheet(
        env,
        { prompt: characterSheetPrompt(member, deps.visualStyle) },
        deps.fetch ?? fetch,
      );
  member.sheetUrl = url;
  await deps.saveSheet?.(member.id, url);
  return url;
}

function pushId(ids: string[], id: string): void {
  if (id && !ids.includes(id)) ids.push(id);
}

/** Sheets for this scene, as ref: ids, with any missing identity text on the prompt. */
export async function sceneCastReference(
  env: EnvLike,
  members: readonly CastMember[],
  prompt: string,
  deps: SheetDeps = {},
  extraIds: readonly string[] = [],
): Promise<SceneCastReference> {
  const elementIds: string[] = [];
  const identities: string[] = [];
  let sheetCount = 0;
  for (const member of members) {
    const sheet = await ensureCharacterSheet(env, member, deps);
    if (!sheet) continue;
    if (sheetCount < MAX_SCENE_SHEETS) {
      pushId(elementIds, `ref:${encodeURIComponent(sheet)}`);
      sheetCount += 1;
    }
    const identity = member.identityText.trim();
    if (identity && !identities.includes(identity)) identities.push(identity);
  }
  for (const id of extraIds) {
    if (id.startsWith("ref:") || id.startsWith("http://") || id.startsWith("https://")) pushId(elementIds, id);
  }
  const missing = identities.filter((text) => !prompt.includes(text));
  const next = missing.length > 0 ? `${missing.join("\n")}\n${prompt}`.trim() : prompt.trim();
  return { prompt: next, elementIds };
}

export interface CastImageSource {
  kind: "sheet" | "anchor";
  castId: string;
  url: string;
  state: string;
}

/** The approved sheet or anchor wins. Otherwise the latest image that is not failed. */
export function preferredCastImage(member: CastMember, sources: readonly CastImageSource[]): CastMember {
  const pick = (kind: "sheet" | "anchor"): string | undefined => {
    const rows = sources.filter((row) => row.kind === kind && row.castId === member.id && row.url.trim() && row.state !== "failed");
    return (rows.find((row) => row.state === "approved") ?? rows.at(-1))?.url;
  };
  return {
    ...member,
    sheetUrl: pick("sheet") ?? member.sheetUrl,
    anchorUrl: pick("anchor") ?? member.anchorUrl,
  };
}

/**
 * Scene edits must receive the sheet as well as the face anchor.
 * `references` is the kinds that were actually attached, sheet first.
 */
export function includeCastReferences(
  elementIds: readonly string[],
  members: readonly Pick<CastMember, "role" | "sheetUrl" | "anchorUrl">[],
): { elementIds: string[]; references: Array<"sheet" | "anchor"> } {
  const visible = members.filter((member) => member.role !== "narrator");
  const sheetUrls = visible
    .map((member) => member.sheetUrl?.trim() ?? "")
    .filter(Boolean)
    .slice(0, MAX_SCENE_SHEETS);
  const anchorUrls = visible.map((member) => member.anchorUrl?.trim() ?? "").filter(Boolean);
  const sheets: string[] = [];
  const anchors: string[] = [];
  const rest: string[] = [];
  const place = (id: string) => {
    const url = anchorUrlFromElementId(id) ?? id;
    if (sheetUrls.includes(url)) {
      if (!sheets.includes(id)) sheets.push(id);
      return;
    }
    if (anchorUrls.includes(url)) {
      if (!anchors.includes(id)) anchors.push(id);
      return;
    }
    if (!rest.includes(id)) rest.push(id);
  };
  for (const id of elementIds) place(id);
  for (const url of sheetUrls) place(elementIdForAnchor(url));
  for (const url of anchorUrls) place(elementIdForAnchor(url));
  const references: Array<"sheet" | "anchor"> = [];
  if (sheets.length > 0) references.push("sheet");
  if (anchors.length > 0) references.push("anchor");
  return { elementIds: [...sheets, ...anchors, ...rest], references };
}

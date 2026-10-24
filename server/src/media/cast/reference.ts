import type { EnvLike } from "../flags.js";
import { moduleMock } from "../flags.js";
import { mockAssets, publicUrl } from "../placeholders.js";

/**
 * REST cast references.
 *
 * Higgsfield Reference Elements (`<<<element_id>>>` rewritten server-side)
 * exist on the Higgsfield MCP, not on the public REST API. This adapter keeps
 * the `higgsfieldElementId` field and fills it with `ref:` plus the encoded
 * anchor URL. Keyframes then go to Qwen Image 3 edit with that URL, and clips
 * go to Seedance image-to-video or reference-to-video.
 *
 * Swap the adapter for an MCP Elements implementation later. `resolvePrompt`
 * on that adapter can keep real `<<<uuid>>>` tokens; this one will not invent
 * them.
 */
export interface CastReference {
  castId: string;
  name: string;
  identityText: string;
  anchorUrl: string;
  higgsfieldElementId: string;
  status: "completed" | "failed";
  error?: string;
}

export interface CreateCastReferenceInput {
  castId: string;
  name: string;
  identityText: string;
  anchorUrl?: string;
  anchorBytes?: Uint8Array;
  contentType?: string;
}

export interface ResolvedCastPrompt {
  prompt: string;
  anchorUrls: string[];
  elementIds: string[];
  unresolvedIds: string[];
}

export type AnchorUploader = (bytes: Uint8Array, contentType: string) => Promise<string>;

export interface CastReferenceAdapter {
  readonly kind: "rest" | "mock";
  createReference(input: CreateCastReferenceInput): Promise<CastReference>;
  resolvePrompt(prompt: string, elementIds: string[]): ResolvedCastPrompt;
  get(elementId: string): CastReference | undefined;
}

const REF_PREFIX = "ref:";

export function elementIdForAnchor(anchorUrl: string): string {
  return `${REF_PREFIX}${encodeURIComponent(anchorUrl)}`;
}

export function anchorUrlFromElementId(elementId: string): string | undefined {
  if (!elementId.startsWith(REF_PREFIX)) return undefined;
  try {
    const url = decodeURIComponent(elementId.slice(REF_PREFIX.length));
    return url.length > 0 ? url : undefined;
  } catch {
    return undefined;
  }
}

export function resolveRestPrompt(
  prompt: string,
  elementIds: string[],
  lookup: (id: string) => CastReference | undefined,
): ResolvedCastPrompt {
  const anchorUrls: string[] = [];
  const resolvedIds: string[] = [];
  const unresolvedIds: string[] = [];
  const identities: string[] = [];
  const seen = new Set<string>();

  const consider = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const stored = lookup(id);
    const url = anchorUrlFromElementId(id) ?? stored?.anchorUrl;
    if (!url) {
      unresolvedIds.push(id);
      return;
    }
    resolvedIds.push(id);
    if (!anchorUrls.includes(url)) anchorUrls.push(url);
    const identity = stored?.identityText.trim() ?? "";
    if (identity && !identities.includes(identity)) identities.push(identity);
  };

  for (const id of elementIds) consider(id);
  for (const match of prompt.matchAll(/<<<([^>]+)>>>/g)) consider(match[1] ?? "");

  let cleaned = prompt
    .replace(/<<<[^>]+>>>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

  const missing = identities.filter((text) => !cleaned.includes(text));
  if (missing.length > 0) cleaned = `${missing.join("\n")}\n${cleaned}`.trim();

  return { prompt: cleaned, anchorUrls, elementIds: resolvedIds, unresolvedIds };
}

class RegistryCastAdapter implements CastReferenceAdapter {
  readonly kind: "rest" | "mock";
  private byId = new Map<string, CastReference>();

  constructor(
    kind: "rest" | "mock",
    private readonly env: EnvLike,
    private readonly upload?: AnchorUploader,
  ) {
    this.kind = kind;
  }

  async createReference(input: CreateCastReferenceInput): Promise<CastReference> {
    let anchorUrl = input.anchorUrl?.trim() ?? "";
    if (!anchorUrl && input.anchorBytes && input.anchorBytes.byteLength > 0) {
      if (this.kind === "mock") {
        anchorUrl = publicUrl(this.env, `${mockAssets.anchor}?cast=${encodeURIComponent(input.castId)}`);
      } else if (this.upload) {
        anchorUrl = await this.upload(input.anchorBytes, input.contentType?.trim() || "image/png");
      } else {
        return failedRef(input, "face anchor upload requires the Higgsfield adapter");
      }
    }
    if (!anchorUrl) {
      if (this.kind === "mock") {
        anchorUrl = publicUrl(this.env, `${mockAssets.anchor}?cast=${encodeURIComponent(input.castId)}`);
      } else {
        return failedRef(input, "face anchor url or bytes required");
      }
    }

    const ref: CastReference = {
      castId: input.castId,
      name: input.name,
      identityText: input.identityText,
      anchorUrl,
      higgsfieldElementId: elementIdForAnchor(anchorUrl),
      status: "completed",
    };
    this.byId.set(ref.higgsfieldElementId, ref);
    return ref;
  }

  resolvePrompt(prompt: string, elementIds: string[]): ResolvedCastPrompt {
    return resolveRestPrompt(prompt, elementIds, (id) => this.byId.get(id));
  }

  get(elementId: string): CastReference | undefined {
    return this.byId.get(elementId);
  }
}

function failedRef(input: CreateCastReferenceInput, error: string): CastReference {
  return {
    castId: input.castId,
    name: input.name,
    identityText: input.identityText,
    anchorUrl: "",
    higgsfieldElementId: "",
    status: "failed",
    error,
  };
}

export interface CastAdapterDeps {
  uploadAnchor?: AnchorUploader;
}

export function createCastAdapter(env: EnvLike = process.env, deps: CastAdapterDeps = {}): CastReferenceAdapter {
  if (moduleMock(env, "CAST_MOCK")) return new RegistryCastAdapter("mock", env);
  return new RegistryCastAdapter("rest", env, deps.uploadAnchor);
}

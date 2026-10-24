import type { MediaProviderName } from "../../../packages/shared/types.ts";

/** How many scenes generate at once. Provider polls run inside a scene slot. */
export const SCENE_CONCURRENCY = 3;

export type SceneStep = "image" | "clip" | "voice";

export interface SceneShot {
  sceneId: string;
  index: number;
  imagePrompt: string;
  motionPrompt: string;
  durationSec: 5 | 10;
  vo: string;
  voiceId: string;
  /** http(s) or ref: ids. A non-empty list selects gpt-image-2 /images/edits. */
  anchorUrls: string[];
}

export interface StepMedia {
  url: string;
  provider: MediaProviderName;
  model: string;
  providerLabel: string;
  durationMs?: number;
}

export interface SceneMedia {
  sceneId: string;
  image: StepMedia;
  clip: StepMedia;
  voice: StepMedia;
}

export interface ScenePorts {
  image(shot: SceneShot): Promise<StepMedia>;
  clip(shot: SceneShot, image: StepMedia): Promise<StepMedia>;
  voice(shot: SceneShot): Promise<StepMedia>;
}

export interface SceneProgress {
  sceneId: string;
  kind: SceneStep;
  status: "generating" | "done" | "failed";
  percent?: number;
  url?: string;
  error?: string;
  provider: MediaProviderName;
  model: string;
  providerLabel?: string;
}

export interface RunSceneOptions {
  concurrency?: number;
  onProgress?: (event: SceneProgress) => void;
  /** Peak in-flight scene count. Polling stays inside the scene. */
  observe?: (active: number) => void;
  /** Regen touches this set and leaves every other scene cached. */
  onlySceneIds?: ReadonlySet<string>;
  /** Steps to reuse from `cached` instead of calling the provider. */
  skip?: Partial<Record<string, readonly SceneStep[]>>;
  cached?: Partial<Record<string, Partial<Record<SceneStep, StepMedia>>>>;
}

export function sceneConcurrency(env: { SCENE_CONCURRENCY?: string } = {}): number {
  const parsed = Number(env.SCENE_CONCURRENCY ?? SCENE_CONCURRENCY);
  if (!Number.isFinite(parsed) || parsed < 1) return SCENE_CONCURRENCY;
  return Math.min(6, Math.floor(parsed));
}

/** Seedance accepts 5 or 10. Anything else snaps the same way as the storyboard. */
export function sceneDurationSec(value: unknown, fallbackMs?: number): 5 | 10 {
  if (value === 5 || value === 10) return value;
  if (value === "5" || value === "10") return Number(value) as 5 | 10;
  return (fallbackMs ?? 0) >= 7500 ? 10 : 5;
}

/**
 * Image regen rebuilds the clip that used that still. Clip and voice regen
 * keep the other steps and only the final concat is rebuilt.
 */
export function regenScope(target: SceneStep): { rerun: SceneStep[]; keep: SceneStep[] } {
  if (target === "image") return { rerun: ["image", "clip"], keep: ["voice"] };
  if (target === "clip") return { rerun: ["clip"], keep: ["image", "voice"] };
  return { rerun: ["voice"], keep: ["image", "clip"] };
}

export function castAnchorIds(
  members: Array<{ anchorUrl?: string; higgsfieldElementId?: string }>,
  extra: readonly string[] = [],
): string[] {
  const ids: string[] = [];
  const push = (id: string) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  for (const id of extra) {
    if (id.startsWith("ref:") || id.startsWith("http://") || id.startsWith("https://")) push(id);
  }
  for (const member of members) {
    const element = member.higgsfieldElementId ?? "";
    if (element.startsWith("ref:") || element.startsWith("http://") || element.startsWith("https://")) {
      push(element);
      continue;
    }
    const url = member.anchorUrl?.trim() ?? "";
    if (url.startsWith("http://") || url.startsWith("https://")) push(`ref:${encodeURIComponent(url)}`);
  }
  return ids;
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  observe?: (active: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let active = 0;
  let failure: unknown;
  const cap = Math.max(1, Math.min(Math.floor(limit) || 1, items.length || 1));

  async function run(): Promise<void> {
    while (failure === undefined) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      active += 1;
      observe?.(active);
      try {
        results[index] = await worker(items[index] as T, index);
      } catch (error) {
        failure ??= error;
      } finally {
        active -= 1;
        observe?.(active);
      }
    }
  }

  await Promise.all(Array.from({ length: cap }, () => run()));
  if (failure) throw failure;
  return results;
}

async function emitStep(
  sceneId: string,
  kind: SceneStep,
  work: () => Promise<StepMedia>,
  onProgress: RunSceneOptions["onProgress"],
): Promise<StepMedia> {
  onProgress?.({ sceneId, kind, status: "generating", percent: 10, provider: "mock", model: "" });
  try {
    const result = await work();
    onProgress?.({
      sceneId,
      kind,
      status: "done",
      percent: 100,
      url: result.url,
      provider: result.provider,
      model: result.model,
      providerLabel: result.providerLabel,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "scene step failed";
    onProgress?.({ sceneId, kind, status: "failed", error: message, provider: "mock", model: "" });
    throw error;
  }
}

async function runOne(shot: SceneShot, ports: ScenePorts, options: RunSceneOptions): Promise<SceneMedia> {
  const skip = new Set(options.skip?.[shot.sceneId] ?? []);
  const cache = options.cached?.[shot.sceneId] ?? {};
  const take = async (kind: SceneStep, work: () => Promise<StepMedia>): Promise<StepMedia> => {
    const saved = cache[kind];
    if (skip.has(kind) && saved) return saved;
    return emitStep(shot.sceneId, kind, work, options.onProgress);
  };
  const imageTask = take("image", () => ports.image(shot));
  const voiceTask = take("voice", () => ports.voice(shot));
  const [image, voice] = await Promise.all([imageTask, voiceTask]);
  const clip = await take("clip", () => ports.clip(shot, image));
  return { sceneId: shot.sceneId, image, clip, voice };
}

/** Image and voice share a scene slot. The clip starts after that scene's still is ready. */
export async function runSceneShots(
  shots: readonly SceneShot[],
  ports: ScenePorts,
  options: RunSceneOptions = {},
): Promise<SceneMedia[]> {
  const selected = options.onlySceneIds
    ? shots.filter((shot) => options.onlySceneIds?.has(shot.sceneId))
    : [...shots];
  return mapWithConcurrency(
    selected,
    options.concurrency ?? SCENE_CONCURRENCY,
    (shot) => runOne(shot, ports, options),
    options.observe,
  );
}

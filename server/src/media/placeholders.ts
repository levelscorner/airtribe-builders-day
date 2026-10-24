import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EnvLike } from "./flags.js";

const here = dirname(fileURLToPath(import.meta.url));

/** 9:16 stills, a short silent clip, and a silent line. Served from server/public. */
export const mockAssetDir = join(here, "../../public/mock");

export const mockAssets = {
  anchor: "/mock/anchor.png",
  keyframe: "/mock/keyframe.png",
  clip: "/mock/clip.mp4",
  voice: "/mock/line.mp3",
} as const;

export function publicUrl(env: EnvLike, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = (env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

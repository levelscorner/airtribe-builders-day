import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EnvLike } from "./flags.js";
import { publicUrl } from "./placeholders.js";

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../data/media");

export function mediaRoot(env: EnvLike): string {
  return env.MEDIA_ROOT?.trim() || defaultRoot;
}

/** Store generated PNG bytes and return the public /media/images URL. */
export async function savePng(env: EnvLike, id: string, bytes: Buffer): Promise<string> {
  const dir = join(mediaRoot(env), "images");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.png`), bytes);
  return publicUrl(env, `/media/images/${id}.png`);
}

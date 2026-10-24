import { MediaInputError } from "../errors.js";
import type { EnvLike } from "../flags.js";

export interface HiggsfieldCredentials {
  id: string;
  secret: string;
}

/** `Authorization: Key ID:SECRET`. Accepts the docs/14 name and the split console vars. */
export function higgsfieldCredentials(env: EnvLike): HiggsfieldCredentials {
  const combined = env.HIGGSFIELD_API_KEY?.trim() || env.HF_CREDENTIALS?.trim() || env.HF_KEY?.trim() || "";
  if (combined) {
    const splitAt = combined.indexOf(":");
    const id = splitAt > 0 ? combined.slice(0, splitAt).trim() : "";
    const secret = splitAt > 0 ? combined.slice(splitAt + 1).trim() : "";
    if (!id || !secret) {
      throw new MediaInputError("Higgsfield API key must be KEY_ID:KEY_SECRET");
    }
    return { id, secret };
  }

  const id = env.HF_API_KEY_ID?.trim() ?? "";
  const secret = env.HF_API_KEY_SECRET?.trim() ?? "";
  if (id && secret) return { id, secret };
  throw new MediaInputError(
    "Higgsfield credentials missing. Set HIGGSFIELD_API_KEY or HF_API_KEY_ID and HF_API_KEY_SECRET.",
  );
}

export function higgsfieldAuthorization(env: EnvLike): string {
  const credentials = higgsfieldCredentials(env);
  return `Key ${credentials.id}:${credentials.secret}`;
}

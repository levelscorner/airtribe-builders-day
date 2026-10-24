export type EnvLike = Record<string, string | undefined>;

function flag(value: string | undefined): boolean | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const v = value.toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return undefined;
}

/** MOCK=1 mocks every port. IMAGE_MOCK / CLIP_MOCK / VOICE_MOCK / CAST_MOCK override that. */
export function moduleMock(env: EnvLike, specific: string): boolean {
  const override = flag(env[specific]);
  if (override !== undefined) return override;
  return flag(env.MOCK) === true;
}

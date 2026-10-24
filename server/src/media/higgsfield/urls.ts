import { MediaInputError } from "../errors.js";

export function assertHttpUrl(url: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MediaInputError(`${label} must be an http(s) url`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MediaInputError(`${label} must be an http(s) url`);
  }
}

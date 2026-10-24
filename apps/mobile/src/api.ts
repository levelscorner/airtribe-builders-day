import { ApiPaths } from "@chotu/shared";
import { createHttpStudio } from "./http-studio";
import { createMockStudio } from "./mock-studio";
import type { StudioClient } from "./studio-client";

export type { StudioClient } from "./studio-client";
export { StudioHttpError } from "./http-studio";
export { StudioMockError } from "./mock-studio";

/** Path table from @chotu/shared. */
export const studioRoutes = ApiPaths;

function studioMode(): "http" | "mock" {
  const explicit = process.env.EXPO_PUBLIC_STUDIO_MODE?.trim().toLowerCase();
  if (explicit === "http" || explicit === "mock") return explicit;
  // Default: hit Saturn /v1 when an API base is configured (incl. empty = same origin).
  if (process.env.EXPO_PUBLIC_API_URL !== undefined) return "http";
  return "mock";
}

/**
 * Chat shell talks only to StudioClient.
 * - mock: in-process Gaia fixture (offline / unit checks)
 * - http: Saturn /v1 (+ SSE) for MOCK=1 Replit / preview
 */
export function createStudioClient(): StudioClient {
  if (studioMode() === "http") {
    return createHttpStudio(process.env.EXPO_PUBLIC_API_URL ?? "");
  }
  return createMockStudio();
}

let singleton: StudioClient | null = null;

export function getStudioClient(): StudioClient {
  if (!singleton) singleton = createStudioClient();
  return singleton;
}

/** Test helper — drop the process singleton between suites. */
export function resetStudioClient(): void {
  singleton = null;
}

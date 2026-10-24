import { ApiPaths } from "@chotu/shared";
import { createMockStudio } from "./mock-studio";
import type { StudioClient } from "./studio-client";

export type { StudioClient } from "./studio-client";

/** Path table from @chotu/shared. The mock never calls these URLs. */
export const studioRoutes = ApiPaths;

/**
 * Chat shell talks only to StudioClient.
 * Swap createMockStudio for a fetch client against studioRoutes when the
 * docs/14 server is up. This build does not open the network.
 */
export function createStudioClient(): StudioClient {
  return createMockStudio();
}

let singleton: StudioClient | null = null;

export function getStudioClient(): StudioClient {
  if (!singleton) singleton = createStudioClient();
  return singleton;
}

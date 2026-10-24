import { env } from "../env.js";
import { MockVisualsProvider } from "./mock.js";
import { HiggsfieldVisualsProvider } from "./higgsfield.js";
import { OpenArtVisualsProvider } from "./openart.js";
import type { VisualsProvider } from "./types.js";

export type { SceneVisual, VisualsProvider, VisualsRequest, VisualsProviderId } from "./types.js";

export function resolveVisualsProvider(): VisualsProvider {
  switch (env.visualsProvider) {
    case "mock":
      return new MockVisualsProvider();
    case "higgsfield":
      return new HiggsfieldVisualsProvider();
    case "openart":
      return new OpenArtVisualsProvider();
    default: {
      const _x: never = env.visualsProvider;
      throw new Error(`Unknown VISUALS_PROVIDER: ${String(_x)}`);
    }
  }
}

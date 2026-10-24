import type { Style } from "../jobs/types.js";

export type VisualKind = "image" | "video";

export interface SceneVisual {
  kind: VisualKind;
  imagePath: string;
  imageUrl: string;
  videoPath?: string;
  videoUrl?: string;
  provider: string;
  meta?: Record<string, unknown>;
}

export interface VisualsRequest {
  jobId: string;
  sceneIndex: number;
  prompt: string;
  style: Style;
  imagesDir: string;
  videosDir: string;
}

export interface VisualsProvider {
  readonly id: "mock" | "higgsfield" | "openart";
  generateSceneVisual(req: VisualsRequest): Promise<SceneVisual>;
}

export type VisualsProviderId = VisualsProvider["id"];

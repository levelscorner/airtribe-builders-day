export type Resolution = "720p" | "1080p";

export interface RenderSceneInput {
  idx: number;
  clipUrl?: string;
  imageUrl?: string;
  audioUrl: string;
  narration: string;
  durationMs: number;
}

export interface RendererInput {
  videoId: string;
  aspectRatio: string;
  resolution: Resolution;
  scenes: RenderSceneInput[];
  captionStyle?: string;
}

export interface RendererOutput {
  url: string;
  durationMs: number;
  provider: "ffmpeg" | "render_workflow" | "mock";
}

export interface Renderer {
  render(input: RendererInput): Promise<RendererOutput>;
}

export function frameSize(resolution: Resolution): { width: number; height: number } {
  if (resolution === "720p") return { width: 720, height: 1280 };
  return { width: 1080, height: 1920 };
}

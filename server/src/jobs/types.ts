import { z } from "zod";

export const LanguageSchema = z.enum(["en", "hi"]);
export type Language = z.infer<typeof LanguageSchema>;

export const StyleSchema = z.enum(["watercolor-storybook", "cartoon"]);
export type Style = z.infer<typeof StyleSchema>;

export const SceneSchema = z.object({
  narration: z.string().min(1),
  imagePrompt: z.string().min(1),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScriptSchema = z.object({
  title: z.string().min(1),
  scenes: z.array(SceneSchema).min(4).max(5),
});
export type Script = z.infer<typeof ScriptSchema>;

export type StageName = "script" | "visuals" | "voice" | "render" | "verify";
export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StageState {
  name: StageName;
  status: StageStatus;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface SceneAssets {
  index: number;
  narration: string;
  imagePrompt: string;
  imagePath?: string;
  imageUrl?: string;
  /** Optional motion clip from Visuals MCP (Higgsfield/OpenArt i2v). */
  videoPath?: string;
  videoUrl?: string;
  visualKind?: "image" | "video";
  visualProvider?: string;
  audioPath?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  caption?: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  topic: string;
  language: Language;
  style: Style;
  status: JobStatus;
  stages: StageState[];
  script?: Script;
  scenes: SceneAssets[];
  videoPath?: string;
  videoUrl?: string;
  /** When ffmpeg fails, app can still play slideshow from scenes. */
  slideshowFallback: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
}

export const CreateJobBodySchema = z.object({
  topic: z.string().min(2).max(200),
  language: LanguageSchema.default("en"),
  style: StyleSchema.default("watercolor-storybook"),
});
export type CreateJobBody = z.infer<typeof CreateJobBodySchema>;

export function initialStages(): StageState[] {
  return (["script", "visuals", "voice", "render", "verify"] as StageName[]).map((name) => ({
    name,
    status: "pending" as const,
  }));
}

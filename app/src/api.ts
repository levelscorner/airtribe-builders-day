import { API_BASE_URL } from "./config";

export type Language = "en" | "hi";
export type Style = "watercolor-storybook" | "cartoon";
export type StageName = "script" | "visuals" | "voice" | "render" | "verify";
export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StageState {
  name: StageName;
  status: StageStatus;
  message?: string;
}

export interface ScenePublic {
  index: number;
  narration: string;
  imageUrl?: string;
  videoUrl?: string;
  visualKind?: "image" | "video";
  visualProvider?: string;
  audioUrl?: string;
  audioDurationSec?: number;
  caption?: string;
}

export interface JobPublic {
  id: string;
  topic: string;
  language: Language;
  style: Style;
  status: "queued" | "running" | "done" | "failed";
  stages: StageState[];
  scenes: ScenePublic[];
  videoUrl?: string;
  slideshowFallback: boolean;
  error?: string;
  mockMode?: boolean;
  script?: { title: string; sceneCount: number };
}

export async function createJob(input: {
  topic: string;
  language: Language;
  style: Style;
}): Promise<JobPublic> {
  const res = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create job failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<JobPublic>;
}

export async function getJob(id: string): Promise<JobPublic> {
  const res = await fetch(`${API_BASE_URL}/api/jobs/${id}`);
  if (!res.ok) throw new Error(`Get job failed: ${res.status}`);
  return res.json() as Promise<JobPublic>;
}

export async function healthCheck(): Promise<{ ok: boolean; mockMode: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/health`);
  if (!res.ok) throw new Error("API unreachable");
  return res.json() as Promise<{ ok: boolean; mockMode: boolean }>;
}

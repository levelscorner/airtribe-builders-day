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

export interface ActivityEntry {
  id: string;
  at: string;
  node: string;
  tool?: string;
  provider?: string;
  status: string;
  message?: string;
}

export interface ScriptPublic {
  title: string;
  scenes: Array<{ narration: string; imagePrompt: string }>;
}

export interface JobPublic {
  id: string;
  userId: string;
  topic: string;
  language: Language;
  style: Style;
  status:
    | "queued"
    | "running"
    | "awaiting_script_approval"
    | "awaiting_final_approval"
    | "published"
    | "failed";
  stages: StageState[];
  scenes: ScenePublic[];
  script?: ScriptPublic;
  videoUrl?: string;
  slideshowFallback: boolean;
  publishUnlocked: boolean;
  scriptApproved: boolean;
  finalApproved: boolean;
  activity: ActivityEntry[];
  error?: string;
  mockMode?: boolean;
  visualsProvider?: string;
}

export interface UserPublic {
  id: string;
  name: string;
  contact: string;
  credits: number;
  createdAt: string;
}

export interface TractionEvent {
  id: string;
  type: string;
  at: string;
  userId?: string;
  jobId?: string;
  detail: string;
}

export interface PackCatalog {
  name: string;
  credits: number;
  priceInr: number;
  mock: boolean;
  note: string;
}

export interface PackCheckout {
  id: string;
  paymentUrl: string;
  credits: number;
  priceInr: number;
  status: string;
  mock: boolean;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function signup(name: string, contact: string): Promise<UserPublic> {
  const res = await fetch(`${API_BASE_URL}/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, contact }),
  });
  return json(res);
}

export async function getUser(id: string): Promise<UserPublic> {
  const res = await fetch(`${API_BASE_URL}/api/users/${id}`);
  return json(res);
}

export async function createJob(input: {
  userId: string;
  topic: string;
  language: Language;
  style: Style;
}): Promise<{ job: JobPublic; user: UserPublic }> {
  const res = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return json(res);
}

export async function getJob(id: string): Promise<JobPublic> {
  const res = await fetch(`${API_BASE_URL}/api/jobs/${id}`);
  return json(res);
}

export async function approveScript(jobId: string, userId: string): Promise<JobPublic> {
  const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/approve-script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return json(res);
}

export async function approveFinal(jobId: string, userId: string): Promise<JobPublic> {
  const res = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/approve-final`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return json(res);
}

export async function getPackCatalog(): Promise<PackCatalog> {
  const res = await fetch(`${API_BASE_URL}/api/packs`);
  return json(res);
}

export async function startPackCheckout(userId: string): Promise<PackCheckout> {
  const res = await fetch(`${API_BASE_URL}/api/packs/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return json(res);
}

export async function completePack(checkoutId: string): Promise<{ user: UserPublic }> {
  const res = await fetch(`${API_BASE_URL}/api/packs/${checkoutId}/complete`, { method: "POST" });
  return json(res);
}

export async function listEvents(): Promise<{ events: TractionEvent[] }> {
  const res = await fetch(`${API_BASE_URL}/api/admin/events`);
  return json(res);
}

export async function healthCheck(): Promise<{
  ok: boolean;
  mockMode: boolean;
  visualsProvider?: string;
}> {
  const res = await fetch(`${API_BASE_URL}/api/health`);
  return json(res);
}

export { API_BASE_URL };

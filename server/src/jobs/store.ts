import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { env } from "../env.js";
import {
  type CreateJobBody,
  type Job,
  type StageName,
  type StageStatus,
  initialStages,
} from "./types.js";

const jobs = new Map<string, Job>();

mkdirSync(env.dataDir, { recursive: true });
mkdirSync(join(env.dataDir, "jobs"), { recursive: true });
mkdirSync(join(env.dataDir, "cache", "voice"), { recursive: true });

export function jobDir(jobId: string): string {
  const dir = join(env.dataDir, "jobs", jobId);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "images"), { recursive: true });
  mkdirSync(join(dir, "audio"), { recursive: true });
  mkdirSync(join(dir, "captions"), { recursive: true });
  mkdirSync(join(dir, "clips"), { recursive: true });
  return dir;
}

export function createJob(body: CreateJobBody): Job {
  const id = uuidv4();
  const now = new Date().toISOString();
  const job: Job = {
    id,
    topic: body.topic.trim(),
    language: body.language,
    style: body.style,
    status: "queued",
    stages: initialStages(),
    scenes: [],
    slideshowFallback: false,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
  };
  jobs.set(id, job);
  jobDir(id);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateJob(id: string, patch: Partial<Job>): Job {
  const job = jobs.get(id);
  if (!job) throw new Error(`Job ${id} not found`);
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  jobs.set(id, job);
  return job;
}

export function setStage(
  id: string,
  name: StageName,
  status: StageStatus,
  message?: string,
): Job {
  const job = getJob(id);
  if (!job) throw new Error(`Job ${id} not found`);
  const stage = job.stages.find((s) => s.name === name);
  if (!stage) throw new Error(`Stage ${name} missing`);
  stage.status = status;
  if (message !== undefined) stage.message = message;
  if (status === "running") stage.startedAt = new Date().toISOString();
  if (status === "done" || status === "failed" || status === "skipped") {
    stage.finishedAt = new Date().toISOString();
  }
  job.updatedAt = new Date().toISOString();
  return job;
}

export function publicUrl(relativePath: string): string {
  const cleaned = relativePath.replace(/^\/+/, "");
  return `${env.publicBaseUrl}/${cleaned}`;
}

/** Map absolute file under dataDir to /assets/... URL path. */
export function assetUrlFromPath(absPath: string): string {
  const marker = env.dataDir;
  const rel = absPath.startsWith(marker) ? absPath.slice(marker.length).replace(/^\/+/, "") : absPath;
  return publicUrl(`assets/${rel}`);
}

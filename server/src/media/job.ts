import { randomUUID } from "node:crypto";

export type MediaProvider = "openai" | "ark" | "higgsfield" | "elevenlabs" | "mock";

export type MediaJobStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

export interface MediaJob<T> {
  jobId: string;
  provider: MediaProvider;
  status: MediaJobStatus;
  result?: T;
  error?: string;
  costCredits: number;
  idempotencyKey: string;
}

export class JobStore<T> {
  private jobs = new Map<string, MediaJob<T>>();
  private byKey = new Map<string, string>();

  get(jobId: string): MediaJob<T> | undefined {
    return this.jobs.get(jobId);
  }

  getByKey(idempotencyKey: string): MediaJob<T> | undefined {
    const id = this.byKey.get(idempotencyKey);
    return id ? this.jobs.get(id) : undefined;
  }

  insert(job: MediaJob<T>): MediaJob<T> {
    const existing = this.getByKey(job.idempotencyKey);
    if (existing) return existing;
    this.jobs.set(job.jobId, job);
    this.byKey.set(job.idempotencyKey, job.jobId);
    return job;
  }

  save(job: MediaJob<T>): MediaJob<T> {
    const existing = this.getByKey(job.idempotencyKey);
    if (existing && existing.jobId !== job.jobId) return existing;
    this.jobs.set(job.jobId, job);
    this.byKey.set(job.idempotencyKey, job.jobId);
    return job;
  }
}

export function newJobId(): string {
  return randomUUID();
}

export function completedJob<T>(args: {
  provider: MediaProvider;
  result: T;
  costCredits: number;
  idempotencyKey: string;
  jobId?: string;
}): MediaJob<T> {
  return {
    jobId: args.jobId ?? newJobId(),
    provider: args.provider,
    status: "completed",
    result: args.result,
    costCredits: args.costCredits,
    idempotencyKey: args.idempotencyKey,
  };
}

export function failedJob<T>(idempotencyKey: string, error: unknown, provider: MediaProvider = "mock"): MediaJob<T> {
  const message = error instanceof Error ? error.message : "media job failed";
  return {
    jobId: newJobId(),
    provider,
    status: "failed",
    error: message,
    costCredits: 0,
    idempotencyKey,
  };
}

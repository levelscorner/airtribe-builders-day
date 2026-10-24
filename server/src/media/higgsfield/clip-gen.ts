import { randomUUID } from "node:crypto";
import type { ClipGenInput, ClipGenOutput } from "../../../../packages/shared/types.ts";
import type { CastReferenceAdapter } from "../cast/reference.js";
import { createCastAdapter } from "../cast/reference.js";
import { PROVISIONAL_CREDITS } from "../credits.js";
import type { EnvLike } from "../flags.js";
import { moduleMock } from "../flags.js";
import { completedJob, failedJob, JobStore, newJobId, type MediaJob } from "../job.js";
import { mockAssets, publicUrl } from "../placeholders.js";
import type { ClipGenPort, SubmitOpts } from "../ports.js";
import { buildClipSubmission } from "./request.js";

class MockClipGen implements ClipGenPort {
  readonly mode = "mock" as const;
  private readonly store = new JobStore<ClipGenOutput>();

  constructor(
    private readonly env: EnvLike,
    private readonly cast: CastReferenceAdapter,
  ) {}

  async submit(input: ClipGenInput, opts?: SubmitOpts): Promise<MediaJob<ClipGenOutput>> {
    const idempotencyKey = opts?.idempotencyKey?.trim() || randomUUID();
    const existing = this.store.getByKey(idempotencyKey);
    if (existing) return existing;

    try {
      const resolved = this.cast.resolvePrompt(input.videoPrompt, input.elementIds ?? []);
      const submission = buildClipSubmission(input, resolved, { resolution: this.env.CLIP_RESOLUTION });
      const jobId = newJobId();
      return this.store.insert(completedJob<ClipGenOutput>({
        jobId,
        provider: "mock",
        costCredits: PROVISIONAL_CREDITS.clip,
        idempotencyKey,
        result: {
          url: publicUrl(this.env, `${mockAssets.clip}?job=${jobId}`),
          provider: "mock",
          model: submission.endpoint,
        },
      }));
    } catch (error) {
      return this.store.insert(failedJob(idempotencyKey, error));
    }
  }

  async getJob(jobId: string): Promise<MediaJob<ClipGenOutput>> {
    const job = this.store.get(jobId);
    if (!job) throw new Error(`unknown media job ${jobId}`);
    return job;
  }

  async generate(input: ClipGenInput): Promise<ClipGenOutput> {
    const job = await this.submit(input);
    if (job.status !== "completed" || !job.result) {
      throw new Error(job.error || `clip job ${job.status}`);
    }
    return job.result;
  }
}

export interface ClipGenDeps {
  cast?: CastReferenceAdapter;
}

export function createClipGen(env: EnvLike = process.env, deps: ClipGenDeps = {}): ClipGenPort {
  if (!moduleMock(env, "CLIP_MOCK")) {
    throw new Error("ClipGen live Higgsfield adapter is not configured. Set MOCK=1 or CLIP_MOCK=1.");
  }
  return new MockClipGen(env, deps.cast ?? createCastAdapter(env));
}

import { randomUUID } from "node:crypto";
import type { ImageGenInput, ImageGenOutput } from "../../../../packages/shared/types.ts";
import type { CastReferenceAdapter } from "../cast/reference.js";
import { createCastAdapter } from "../cast/reference.js";
import { PROVISIONAL_CREDITS } from "../credits.js";
import type { EnvLike } from "../flags.js";
import { moduleMock } from "../flags.js";
import { completedJob, failedJob, JobStore, newJobId, type MediaJob } from "../job.js";
import { mockAssets, publicUrl } from "../placeholders.js";
import type { ImageGenPort, SubmitOpts } from "../ports.js";
import type { HiggsfieldClient } from "./client.js";
import { createHiggsfieldClient } from "./client.js";
import { LiveImageGen } from "./live.js";
import { buildImageSubmission } from "./request.js";

class MockImageGen implements ImageGenPort {
  readonly mode = "mock" as const;
  private readonly store = new JobStore<ImageGenOutput>();

  constructor(
    private readonly env: EnvLike,
    private readonly cast: CastReferenceAdapter,
  ) {}

  async submit(input: ImageGenInput, opts?: SubmitOpts): Promise<MediaJob<ImageGenOutput>> {
    const idempotencyKey = opts?.idempotencyKey?.trim() || randomUUID();
    const existing = this.store.getByKey(idempotencyKey);
    if (existing) return existing;

    try {
      const resolved = this.cast.resolvePrompt(input.prompt, input.elementIds ?? []);
      const submission = buildImageSubmission(input, resolved);
      const jobId = newJobId();
      return this.store.insert(completedJob<ImageGenOutput>({
        jobId,
        provider: "mock",
        costCredits: PROVISIONAL_CREDITS.image,
        idempotencyKey,
        result: {
          url: publicUrl(this.env, `${mockAssets.keyframe}?job=${jobId}`),
          provider: "mock",
          model: submission.endpoint,
        },
      }));
    } catch (error) {
      return this.store.insert(failedJob(idempotencyKey, error));
    }
  }

  async getJob(jobId: string): Promise<MediaJob<ImageGenOutput>> {
    const job = this.store.get(jobId);
    if (!job) throw new Error(`unknown media job ${jobId}`);
    return job;
  }

  async generate(input: ImageGenInput): Promise<ImageGenOutput> {
    const job = await this.submit(input);
    if (job.status !== "completed" || !job.result) {
      throw new Error(job.error || `image job ${job.status}`);
    }
    return job.result;
  }
}

export interface ImageGenDeps {
  cast?: CastReferenceAdapter;
  higgsfield?: HiggsfieldClient;
}

export function createImageGen(env: EnvLike = process.env, deps: ImageGenDeps = {}): ImageGenPort {
  const cast = deps.cast ?? createCastAdapter(env);
  if (moduleMock(env, "IMAGE_MOCK")) return new MockImageGen(env, cast);
  return new LiveImageGen(env, cast, deps.higgsfield ?? createHiggsfieldClient(env));
}

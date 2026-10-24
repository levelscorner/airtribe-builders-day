import { Router } from "express";
import { ApproveBodySchema, CreateJobBodySchema } from "../jobs/types.js";
import { appendActivity, createJob, getJob, listJobs, updateJob } from "../jobs/store.js";
import { continueAfterScriptApproval, enqueueJob, toPublicJob } from "../pipeline/run.js";
import { env } from "../env.js";
import { getUser, spendCredit, toPublicUser } from "../users/store.js";
import { logEvent } from "../events/store.js";

export const jobsRouter = Router();

jobsRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "chotu-studio-server",
    product: "Chotu Studio",
    mockMode: env.mockMode,
    visualsProvider: env.visualsProvider,
    pineLabsMock: env.pineLabsMock || !env.pineLabsPaymentLinkBase,
  });
});

jobsRouter.post("/jobs", (req, res) => {
  const parsed = CreateJobBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const user = getUser(parsed.data.userId);
  if (!user) {
    res.status(404).json({ error: "User not found — sign up first" });
    return;
  }
  if (user.credits < 1) {
    res.status(402).json({ error: "No video credits left — buy a pack" });
    return;
  }

  const job = createJob(parsed.data);
  try {
    spendCredit(user.id, job.id);
  } catch (err) {
    res.status(402).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  logEvent("job_created", `Job created: “${job.topic}” (${job.language}, ${job.style})`, {
    userId: user.id,
    jobId: job.id,
  });
  appendActivity(job.id, {
    node: "supervisor",
    status: "started",
    message: "Job queued — credit spent",
  });
  enqueueJob(job.id);
  res.status(201).json({ job: toPublicJob(job), user: toPublicUser(getUser(user.id)!) });
});

jobsRouter.get("/jobs", (_req, res) => {
  res.json({ jobs: listJobs().map(toPublicJob) });
});

jobsRouter.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(toPublicJob(job));
});

jobsRouter.post("/jobs/:id/approve-script", (req, res) => {
  const parsed = ApproveBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.userId !== parsed.data.userId) {
    res.status(403).json({ error: "Not your job" });
    return;
  }
  if (job.status !== "awaiting_script_approval") {
    res.status(409).json({ error: `Job is ${job.status}, not awaiting_script_approval` });
    return;
  }
  if (job.approvals.some((a) => a.kind === "script")) {
    res.status(409).json({ error: "Script already approved" });
    return;
  }

  const at = new Date().toISOString();
  job.approvals.push({ kind: "script", at, byUserId: parsed.data.userId });
  updateJob(job.id, { approvals: job.approvals });
  logEvent("approval", `Script approved for “${job.topic}”`, {
    userId: parsed.data.userId,
    jobId: job.id,
    meta: { kind: "script", at },
  });
  appendActivity(job.id, {
    node: "approval",
    status: "done",
    message: "Creator approved script — starting visuals/voice/render",
  });

  continueAfterScriptApproval(job.id);
  res.json(toPublicJob(getJob(job.id)!));
});

jobsRouter.post("/jobs/:id/approve-final", (req, res) => {
  const parsed = ApproveBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.userId !== parsed.data.userId) {
    res.status(403).json({ error: "Not your job" });
    return;
  }
  if (job.status !== "awaiting_final_approval") {
    res.status(409).json({ error: `Job is ${job.status}, not awaiting_final_approval` });
    return;
  }

  const at = new Date().toISOString();
  job.approvals.push({ kind: "final", at, byUserId: parsed.data.userId });
  updateJob(job.id, {
    approvals: job.approvals,
    status: "published",
    publishUnlocked: true,
  });
  logEvent("approval", `Final cut approved / publish unlocked for “${job.topic}”`, {
    userId: parsed.data.userId,
    jobId: job.id,
    meta: { kind: "final", at },
  });
  appendActivity(job.id, {
    node: "approval",
    status: "done",
    message: "Creator approved final cut — download/publish unlocked",
  });

  res.json(toPublicJob(getJob(job.id)!));
});

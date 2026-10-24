import { Router } from "express";
import { CreateJobBodySchema } from "../jobs/types.js";
import { createJob, getJob, listJobs } from "../jobs/store.js";
import { enqueueJob, toPublicJob } from "../pipeline/run.js";
import { env } from "../env.js";

export const jobsRouter = Router();

jobsRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "chotu-mini-server",
    mockMode: env.mockMode,
    visualsProvider: env.visualsProvider,
  });
});

jobsRouter.post("/jobs", (req, res) => {
  const parsed = CreateJobBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const job = createJob(parsed.data);
  enqueueJob(job.id);
  res.status(201).json(toPublicJob(job));
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

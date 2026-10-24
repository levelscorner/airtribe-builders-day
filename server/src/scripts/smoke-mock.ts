/**
 * End-to-end smoke with HITL gates auto-approved (mock).
 */
import { mkdirSync } from "node:fs";
import { env } from "../env.js";
import { signup } from "../users/store.js";
import { createJob, getJob } from "../jobs/store.js";
import { continueAfterScriptApproval, enqueueJob, toPublicJob } from "../pipeline/run.js";
import { spendCredit } from "../users/store.js";
import { logEvent } from "../events/store.js";
import { appendActivity, updateJob } from "../jobs/store.js";

mkdirSync(env.dataDir, { recursive: true });

async function waitStatus(jobId: string, want: string[], timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const j = getJob(jobId)!;
    process.stdout.write(`\rstatus=${j.status}   `);
    if (want.includes(j.status) || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("timeout");
}

async function main() {
  const user = signup({ name: "Smoke Tester", contact: "smoke@chotu.studio" });
  console.log("user", user.id, "credits", user.credits);

  const job = createJob({
    userId: user.id,
    topic: "Why the sky is blue",
    language: "en",
    style: "watercolor-storybook",
  });
  spendCredit(user.id, job.id);
  logEvent("job_created", `Smoke job ${job.id}`, { userId: user.id, jobId: job.id });
  appendActivity(job.id, { node: "supervisor", status: "started", message: "smoke" });
  console.log("Created job", job.id, "mockMode=", env.mockMode);
  enqueueJob(job.id);

  let j = await waitStatus(job.id, ["awaiting_script_approval"]);
  if (j.status === "failed") {
    console.error("\nFAIL before script gate", j.error);
    process.exit(1);
  }
  console.log("\nApproving script…");
  const at = new Date().toISOString();
  j.approvals.push({ kind: "script", at, byUserId: user.id });
  updateJob(j.id, { approvals: j.approvals });
  logEvent("approval", "Smoke script approval", { userId: user.id, jobId: j.id, meta: { kind: "script" } });
  continueAfterScriptApproval(j.id);

  j = await waitStatus(job.id, ["awaiting_final_approval"]);
  if (j.status === "failed") {
    console.error("\nFAIL before final gate", j.error);
    process.exit(1);
  }
  console.log("\nApproving final…");
  const at2 = new Date().toISOString();
  j.approvals.push({ kind: "final", at: at2, byUserId: user.id });
  updateJob(j.id, { approvals: j.approvals, status: "published", publishUnlocked: true });
  logEvent("approval", "Smoke final approval", { userId: user.id, jobId: j.id, meta: { kind: "final" } });

  const pub = toPublicJob(getJob(job.id)!);
  console.log(JSON.stringify({ status: pub.status, videoUrl: pub.videoUrl, activity: pub.activity.length, publishUnlocked: pub.publishUnlocked }, null, 2));

  const playable =
    Boolean(pub.videoUrl) ||
    (pub.slideshowFallback && pub.scenes.every((s) => s.imageUrl && s.audioUrl));
  if (!playable || !pub.publishUnlocked) {
    console.error("FAIL: not playable or not unlocked");
    process.exit(1);
  }
  console.log(pub.videoUrl ? `OK video: ${pub.videoUrl}` : "OK slideshow");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

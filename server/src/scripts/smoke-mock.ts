/**
 * End-to-end smoke: create a mock job and wait until done/failed.
 * Exits 0 when videoUrl or slideshowFallback with scenes is ready.
 * Relies on MOCK_MODE=true in server/.env (or missing API keys).
 */
import { mkdirSync } from "node:fs";
import { env } from "../env.js";
import { createJob, getJob } from "../jobs/store.js";
import { enqueueJob, toPublicJob } from "../pipeline/run.js";

mkdirSync(env.dataDir, { recursive: true });

async function main() {
  const job = createJob({
    topic: "Why the sky is blue",
    language: "en",
    style: "watercolor-storybook",
  });
  console.log("Created job", job.id, "mockMode=", env.mockMode);
  enqueueJob(job.id);

  const started = Date.now();
  const timeoutMs = 180_000;

  while (Date.now() - started < timeoutMs) {
    const j = getJob(job.id)!;
    const doneStages = j.stages.filter((s) => s.status === "done").map((s) => s.name);
    process.stdout.write(`\rstatus=${j.status} stages=[${doneStages.join(",")}]   `);
    if (j.status === "done" || j.status === "failed") {
      console.log("\n");
      const pub = toPublicJob(j);
      console.log(JSON.stringify(pub, null, 2));
      if (j.status === "failed") {
        console.error("FAIL:", j.error);
        process.exit(1);
      }
      const playable =
        Boolean(j.videoUrl) ||
        (j.slideshowFallback && j.scenes.every((s) => s.imageUrl && s.audioUrl));
      if (!playable) {
        console.error("FAIL: no video and incomplete slideshow");
        process.exit(1);
      }
      console.log(j.videoUrl ? `OK video: ${j.videoUrl}` : "OK slideshow fallback");
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.error("\nTimeout waiting for job");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

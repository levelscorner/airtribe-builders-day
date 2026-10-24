import { Router } from "express";
import { eventsToCsv, listEvents } from "../events/store.js";
import { listUsers, toPublicUser } from "../users/store.js";
import { listJobs } from "../jobs/store.js";
import { toPublicJob } from "../pipeline/run.js";
import { packCatalog } from "../payments/packs.js";
import { env } from "../env.js";

export const adminRouter = Router();

adminRouter.get("/admin/events", (_req, res) => {
  res.json({ events: listEvents() });
});

adminRouter.get("/admin/events.csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="chotu-studio-events.csv"');
  res.send(eventsToCsv());
});

adminRouter.get("/admin", (_req, res) => {
  const events = listEvents();
  const users = listUsers().map(toPublicUser);
  const jobs = listJobs().map(toPublicJob);
  const pack = packCatalog();

  const rows = events
    .map(
      (e) =>
        `<tr>
          <td>${escapeHtml(e.at)}</td>
          <td><code>${escapeHtml(e.type)}</code></td>
          <td>${escapeHtml(e.detail)}</td>
          <td><code>${escapeHtml(e.userId ?? "")}</code></td>
          <td><code>${escapeHtml(e.jobId ?? "")}</code></td>
        </tr>`,
    )
    .join("\n");

  res.type("html").send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Chotu Studio — Traction log</title>
<style>
  :root { --ink:#14212B; --teal:#1B6B6E; --paper:#F7F1E8; --line:rgba(20,33,43,.12); }
  body { margin:0; font-family:"Source Sans 3", system-ui, sans-serif; background:linear-gradient(160deg,#F7F1E8,#E8D9C4); color:var(--ink); }
  main { max-width:1100px; margin:0 auto; padding:2rem 1.25rem 3rem; }
  h1 { font-family:Georgia, serif; font-size:2rem; color:#0F3F42; margin:0 0 .25rem; }
  .sub { color:#3A4F5C; margin-bottom:1.5rem; }
  .stats { display:flex; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem; }
  .stat { background:#FFF8F0; border:1px solid var(--line); border-radius:12px; padding:.9rem 1.1rem; min-width:8rem; }
  .stat b { display:block; font-size:1.4rem; }
  table { width:100%; border-collapse:collapse; background:#FFF8F0; border-radius:12px; overflow:hidden; font-size:.9rem; }
  th, td { text-align:left; padding:.55rem .7rem; border-bottom:1px solid var(--line); vertical-align:top; }
  th { background:#1B6B6E; color:#FFF8F0; font-weight:600; }
  code { font-size:.8rem; }
  .actions a { display:inline-block; margin-right:.75rem; margin-bottom:1rem; color:var(--teal); font-weight:700; }
</style>
</head><body><main>
  <h1>Chotu Studio — Traction log</h1>
  <p class="sub">Timestamped proof for Track 04. Screenshot this page or export CSV. Mock=${env.mockMode ? "on" : "off"} · Pack ₹${pack.priceInr}/${pack.credits} credits (${pack.mock ? "mock pay" : "Pine Labs link"}).</p>
  <div class="actions">
    <a href="/api/admin/events.csv">Download CSV</a>
    <a href="/api/admin/events">JSON</a>
  </div>
  <div class="stats">
    <div class="stat"><b>${users.length}</b>signups</div>
    <div class="stat"><b>${jobs.length}</b>jobs</div>
    <div class="stat"><b>${events.filter((e) => e.type === "approval").length}</b>approvals</div>
    <div class="stat"><b>${events.filter((e) => e.type === "payment").length}</b>payment events</div>
    <div class="stat"><b>${events.filter((e) => e.type === "render_done").length}</b>renders</div>
  </div>
  <table>
    <thead><tr><th>At (UTC)</th><th>Type</th><th>Detail</th><th>User</th><th>Job</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No events yet — open the app and sign up.</td></tr>'}</tbody>
  </table>
</main></body></html>`);
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

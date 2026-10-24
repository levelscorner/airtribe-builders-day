import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { env } from "./env.js";
import { jobsRouter } from "./routes/jobs.js";
import { usersRouter } from "./routes/users.js";
import { packsRouter } from "./routes/packs.js";
import { adminRouter } from "./routes/admin.js";
import { mcpRegistrySnapshot, startMcpRegistry } from "./mcp/registry.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api", jobsRouter);
app.use("/api", usersRouter);
app.use("/api", packsRouter);
app.use("/api", adminRouter);

app.get("/api/mcp", (_req, res) => {
  res.json(mcpRegistrySnapshot());
});

// Friendly admin URL without /api prefix
app.get("/admin", (_req, res) => {
  res.redirect("/api/admin");
});

if (existsSync(env.dataDir)) {
  app.use("/assets", express.static(env.dataDir, { fallthrough: true, maxAge: "1h" }));
}

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Chotu Studio API</title>
<style>body{font-family:system-ui;max-width:44rem;margin:2rem auto;padding:0 1rem;line-height:1.5}
code{background:#f4f4f4;padding:0.1em 0.35em;border-radius:4px}</style></head>
<body>
<h1>Chotu Studio</h1>
<p>AI production team for Indian creators. Mock: <strong>${env.mockMode}</strong> · Visuals: <strong>${env.visualsProvider}</strong></p>
<ul>
<li><code>POST /api/signup</code></li>
<li><code>POST /api/jobs</code> · approve-script · approve-final</li>
<li><code>GET /api/packs</code> · checkout · mock-pay</li>
<li><code>GET /admin</code> — traction event log</li>
<li><code>GET /api/mcp</code></li>
</ul>
</body></html>`);
});

await startMcpRegistry();

app.listen(env.port, () => {
  console.log(
    `Chotu Studio on http://localhost:${env.port} (mock=${env.mockMode}, visuals=${env.visualsProvider})`,
  );
});

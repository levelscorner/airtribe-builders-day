import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { env } from "./env.js";
import { jobsRouter } from "./routes/jobs.js";
import { mcpRegistrySnapshot, startMcpRegistry } from "./mcp/registry.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api", jobsRouter);

app.get("/api/mcp", (_req, res) => {
  res.json(mcpRegistrySnapshot());
});

if (existsSync(env.dataDir)) {
  app.use("/assets", express.static(env.dataDir, { fallthrough: true, maxAge: "1h" }));
}

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Chotu mini API</title>
<style>body{font-family:system-ui;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5}
code{background:#f4f4f4;padding:0.1em 0.35em;border-radius:4px}</style></head>
<body>
<h1>Chotu mini</h1>
<p>Kids explainer short-video API. Mock: <strong>${env.mockMode}</strong> · Visuals: <strong>${env.visualsProvider}</strong></p>
<p>Server is an <strong>MCP client</strong> (AI SDK) for Higgsfield / OpenArt / ElevenLabs.</p>
<ul>
<li><code>GET /api/health</code></li>
<li><code>GET /api/mcp</code> — discovered tools</li>
<li><code>POST /api/jobs</code> — { topic, language, style }</li>
<li><code>GET /api/jobs/:id</code></li>
</ul>
</body></html>`);
});

await startMcpRegistry();

app.listen(env.port, () => {
  console.log(
    `Chotu mini server on http://localhost:${env.port} (mock=${env.mockMode}, visuals=${env.visualsProvider})`,
  );
});

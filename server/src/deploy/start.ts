/**
 * Replit / single-process start: migrate DB, serve /v1 API + SSE, static Expo web.
 * Mars owns polish; Saturn wires the demo path (docs/14 §5).
 */
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, migrate } from "../db/client.js";
import { createV1Router } from "../routes/v1.js";
import { createSessionMiddleware, createSessionStore } from "../sessions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export async function startServer(options?: { port?: number; listen?: boolean }) {
  const mock = truthy(process.env.MOCK) || truthy(process.env.MOCK_MODE) || !process.env.DATABASE_URL;
  if (mock) process.env.MOCK = process.env.MOCK || "1";

  const db = await getDb();
  await migrate(db);

  const sessions = createSessionStore();
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(createSessionMiddleware(sessions));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mock, memory: db.memory });
  });

  app.use("/v1", createV1Router({ db, mock }));

  const publicDir = resolve(__dirname, "../../public");
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { fallthrough: true }));
  }

  const expoWeb =
    process.env.EXPO_WEB_DIST?.trim() ||
    join(root, "apps/mobile/dist");
  if (existsSync(expoWeb)) {
    app.use(express.static(expoWeb, { fallthrough: true }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/v1") || req.path.startsWith("/api") || req.path.startsWith("/mock")) {
        next();
        return;
      }
      res.sendFile(join(expoWeb, "index.html"), (error) => {
        if (error) next();
      });
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("html").send(`<!doctype html><html><body style="font-family:system-ui;margin:2rem">
        <h1>Chotu Studio API</h1>
        <p>mock=${mock} · memory=${db.memory}</p>
        <p>Expo web build missing at <code>apps/mobile/dist</code>. Run <code>npm run mobile:export</code>.</p>
        <p><code>GET /v1/…</code> is live.</p>
      </body></html>`);
    });
  }

  const port = options?.port ?? Number(process.env.PORT || 8787);
  if (options?.listen === false) {
    return { app, db, sessions, port, mock };
  }
  const server = app.listen(port, () => {
    console.log(`Chotu Studio on http://localhost:${port} (mock=${mock}, memory=${db.memory})`);
  });
  return { app, db, sessions, port, mock, server };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  await startServer();
}

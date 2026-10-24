import "../runtime-env.js";
/**
 * Replit / single-process start: migrate DB, serve /v1 API + SSE, static Expo web.
 * Mars owns polish; Saturn wires the demo path (docs/14 §5).
 */
import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresEventLog } from "../admin/log.js";
import { adminRouter, type PaymentReview } from "../admin/routes.js";
import { dbFromSql } from "../admin/sql-db.js";
import { createCredits } from "../credits/index.js";
import { getDb, migrate } from "../db/client.js";
import { resolveLlmProvider } from "../llm/provider.js";
import { mediaRoot } from "../media/files.js";
import { createPayments, paymentsModeFrom, paymentsRouter } from "../payments/index.js";
import { createV1Router } from "../routes/v1.js";
import { createSessionMiddleware, createSessionStore } from "../sessions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export async function startServer(options?: { port?: number; listen?: boolean }) {
  const explicitOff = ["0", "false", "off", "no"].includes((process.env.MOCK ?? "").trim().toLowerCase());
  const mock =
    !explicitOff &&
    (truthy(process.env.MOCK) || truthy(process.env.MOCK_MODE) || !process.env.DATABASE_URL);
  if (mock) process.env.MOCK = process.env.MOCK || "1";

  const db = await getDb();
  await migrate(db);

  const sessions = createSessionStore(mock ? undefined : join(root, "server/data/sessions.json"));
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

  const marsDb = dbFromSql(db);
  const payMode = paymentsModeFrom({ PAYMENTS_MODE: process.env.PAYMENTS_MODE });
  const payments = createPayments({
    PAYMENTS_MODE: process.env.PAYMENTS_MODE,
    mock: payMode === "pinelabs" && mock,
    ledger: createCredits({ mock: false, db: marsDb }),
    db: marsDb,
    publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/$/, ""),
    PINE_LABS_MOCK: process.env.PINE_LABS_MOCK,
    merchantId: process.env.PINE_LABS_MERCHANT_ID,
    apiKey: process.env.PINE_LABS_API_KEY,
    webhookSecret: process.env.PINE_LABS_WEBHOOK_SECRET,
  });
  const events = createPostgresEventLog(marsDb);
  const review: PaymentReview | undefined =
    payments.listPending && payments.approvePayment && payments.rejectPayment
      ? {
          listPending: () => payments.listPending!(),
          approve: async (paymentId) => ({ creditsGranted: (await payments.approvePayment!(paymentId)).creditsGranted }),
          reject: async (paymentId) => {
            await payments.rejectPayment!(paymentId);
          },
        }
      : undefined;
  app.use(paymentsRouter(payments));
  app.use(adminRouter(events, { mock, database: !db.memory }, review));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mock, memory: db.memory, llm: resolveLlmProvider(), payments: payMode });
  });

  app.use("/v1", createV1Router({ db, mock }));

  const publicDir = resolve(__dirname, "../../public");
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { fallthrough: true }));
  }
  const mediaDir = mediaRoot(process.env);
  app.use("/media", express.static(mediaDir, { fallthrough: true }));

  const expoWeb =
    process.env.EXPO_WEB_DIST?.trim() ||
    join(root, "apps/mobile/dist");
  if (existsSync(expoWeb)) {
    app.use(express.static(expoWeb, { fallthrough: true }));
    app.get("*", (req, res, next) => {
      if (
        req.path.startsWith("/v1") ||
        req.path.startsWith("/api") ||
        req.path.startsWith("/mock") ||
        req.path.startsWith("/admin") ||
        req.path.startsWith("/payments")
      ) {
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
    console.log(
      `Chotu Studio on http://localhost:${port} (mock=${mock}, llm=${resolveLlmProvider()}, memory=${db.memory})`,
    );
  });
  return { app, db, sessions, port, mock, server };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  await startServer();
}

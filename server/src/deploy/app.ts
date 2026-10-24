import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type Express } from "express";
import { adminRouter } from "../admin/routes.js";
import { createMemoryEventLog, createPostgresEventLog, type EventLog } from "../admin/log.js";
import { createPgDb, createPgPool, migrate, type Db } from "../credits/db.js";
import { createCredits } from "../credits/index.js";
import { paymentsRouter } from "../payments/routes.js";
import { createPayments, type PaymentsService } from "../payments/index.js";
import { PaymentError } from "../payments/errors.js";
import { CREDIT_PACKS } from "../payments/packs.js";
import { renderOutputPath } from "../render/ffmpeg.js";
import { readDeployConfig } from "./config.js";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface AppOptions {
  env?: NodeJS.ProcessEnv;
  db?: Db;
  workDir?: string;
  publicDir?: string;
}

export async function createApp(options: AppOptions = {}): Promise<Express> {
  const env = options.env ?? process.env;
  const config = readDeployConfig(env);
  const db = options.db ?? (config.databaseUrl ? createPgDb(createPgPool(config.databaseUrl)) : undefined);
  if (db) await migrate(db);

  const database = Boolean(db);
  const events: EventLog = db ? createPostgresEventLog(db) : createMemoryEventLog();
  const payments = buildPayments(config, db);

  const workDir = options.workDir ?? join(serverRoot, "data", "renders");
  const publicDir = options.publicDir ?? join(serverRoot, "public");
  const app = express();
  app.use(cors());
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        (req as { rawBody?: string }).rawBody = buf.toString("utf8");
      },
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true, mock: config.mock, database });
  });

  app.use(
    paymentsRouter(payments, {
      onCreditsGranted: async (info) => {
        await events.record({
          kind: "payment",
          userId: info.userId,
          payload: { paymentId: info.paymentId, creditsGranted: info.creditsGranted },
        });
      },
    }),
  );
  app.use(adminRouter(events, { mock: config.mock, database }));

  app.get("/v1/videos/:id/download", async (req, res) => {
    const videoId = req.params.id;
    if (!/^[A-Za-z0-9_-]+$/.test(videoId)) {
      res.status(400).json({ error: "bad_video_id" });
      return;
    }
    const file = renderOutputPath(workDir, videoId);
    if (!existsSync(file)) {
      res.status(404).json({ error: "not_ready" });
      return;
    }
    let linkedVideoId: string | undefined;
    if (db) {
      const found = await db.query("SELECT id FROM videos WHERE id = $1", [videoId]);
      if (found.rows[0]) linkedVideoId = videoId;
    }
    await events.record({
      kind: "download",
      videoId: linkedVideoId,
      payload: { videoId },
    });
    res.download(file, `${videoId}.mp4`);
  });

  app.use("/media", express.static(workDir, { fallthrough: true, maxAge: "1h" }));

  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { fallthrough: true }));
  }

  app.get("/", (_req, res) => {
    const index = join(publicDir, "index.html");
    if (existsSync(index)) {
      res.sendFile(index);
      return;
    }
    res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Chotu</title></head>
<body>
<h1>Chotu</h1>
<p>Mock ${config.mock ? "on" : "off"}. Database ${database ? "connected" : "not configured"}.</p>
<ul>
<li><a href="/admin">Traction</a></li>
<li><a href="/v1/packs">Credit packs</a></li>
<li><a href="/health">Health</a></li>
</ul>
</body></html>`);
  });

  return app;
}

function buildPayments(config: ReturnType<typeof readDeployConfig>, db: Db | undefined): PaymentsService {
  const pineLabsMock = config.pineLabsMock ? "1" : "0";
  if (config.mock || config.pineLabsMock) {
    const useDb = Boolean(db) && !config.mock;
    return createPayments({
      mock: config.mock,
      PINE_LABS_MOCK: pineLabsMock,
      ledger: useDb && db ? createCredits({ mock: false, db }) : createCredits({ mock: true }),
      db: useDb ? db : undefined,
      publicBaseUrl: config.publicBaseUrl,
    });
  }
  if (!db || !config.pineMerchantId || !config.pineApiKey || !config.pineWebhookSecret) {
    return unconfiguredPayments();
  }
  return createPayments({
    mock: false,
    PINE_LABS_MOCK: "0",
    ledger: createCredits({ mock: false, db }),
    db,
    merchantId: config.pineMerchantId,
    apiKey: config.pineApiKey,
    webhookSecret: config.pineWebhookSecret,
    publicBaseUrl: config.publicBaseUrl,
  });
}

function unconfiguredPayments(): PaymentsService {
  const refuse = () =>
    Promise.reject(
      new PaymentError("DATABASE_URL and Pine Labs credentials are required when PINE_LABS_MOCK is off", 503, "db_required"),
    );
  return {
    mode: "pine_labs",
    listPacks: async () => CREDIT_PACKS.map((pack) => ({ ...pack })),
    createCheckout: refuse,
    handleWebhook: refuse,
    confirmCallback: refuse,
    findPayment: async () => null,
    mockPay: () => Promise.reject(new PaymentError("Pine Labs mock checkout is off", 404, "mock_disabled")),
  };
}

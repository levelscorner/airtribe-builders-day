import { Router } from "express";
import { renderAdminHtml, renderEventsCsv } from "./format.js";
import type { EventLog } from "./log.js";

const CSV_LIMIT = 5000;

export function adminRouter(log: EventLog, flags: { mock: boolean; database: boolean }): Router {
  const router = Router();

  router.get("/admin", async (_req, res) => {
    const [rows, counts] = await Promise.all([log.list(100), log.counts()]);
    res.type("html").send(renderAdminHtml({ rows, counts, mock: flags.mock, database: flags.database }));
  });

  router.get("/admin/export.csv", async (_req, res) => {
    const rows = await log.list(CSV_LIMIT);
    res.type("text/csv").set("content-disposition", "attachment; filename=\"traction.csv\"").send(renderEventsCsv(rows));
  });

  return router;
}

import { timingSafeEqual } from "node:crypto";
import express, { type Request, type Response, Router } from "express";
import { VIEWPORT_META } from "../html.js";
import type { PendingPayment } from "../payments/qr.js";
import { asyncRoute } from "./async-route.js";
import { escapeHtml, renderAdminHtml, renderEventsCsv } from "./format.js";
import type { EventLog } from "./log.js";

export const ADMIN_COOKIE = "chotu_admin";

export interface PaymentReview {
  listPending(): Promise<PendingPayment[]>;
  approve(paymentId: string): Promise<{ creditsGranted: number }>;
  reject(paymentId: string): Promise<void>;
}

const CSV_LIMIT = 5000;

export function adminRouter(
  log: EventLog,
  flags: { mock: boolean; database: boolean },
  review?: PaymentReview,
): Router {
  const router = Router();

  router.post(
    "/admin/login",
    express.urlencoded({ extended: false }),
    asyncRoute(async (req, res) => {
      const expected = adminToken();
      if (!expected) {
        res.status(503).json({ error: "admin_unconfigured" });
        return;
      }
      const posted = text(req.body?.token);
      if (!sameToken(posted, expected)) {
        res.status(401).json({ error: "admin_required" });
        return;
      }
      res.append("Set-Cookie", adminCookie(expected));
      if (req.is("application/json")) {
        res.json({ ok: true });
        return;
      }
      res.redirect(303, "/admin");
    }),
  );

  router.use((req, res, next) => {
    if (!req.path.startsWith("/admin")) {
      next();
      return;
    }
    if (!allowAdmin(req, res)) return;
    next();
  });

  router.get("/admin", asyncRoute(async (_req, res) => {
    const [rows, counts] = await Promise.all([log.list(100), log.counts()]);
    res.type("html").send(renderAdminHtml({ rows, counts, mock: flags.mock, database: flags.database }));
  }));

  router.get("/admin/payments", asyncRoute(async (_req, res) => {
    const pending = review ? await review.listPending() : [];
    res.type("html").send(renderPaymentsHtml(pending, Boolean(review)));
  }));

  router.post(
    "/admin/payments/approve",
    express.urlencoded({ extended: false }),
    asyncRoute(async (req, res) => {
      if (!review) {
        res.status(404).json({ error: "qr_disabled" });
        return;
      }
      const paymentId = text(req.body?.paymentId);
      const result = await review.approve(paymentId);
      if (result.creditsGranted > 0) {
        await log.record({ kind: "payment", payload: { paymentId, creditsGranted: result.creditsGranted } });
      }
      if (req.is("application/json")) {
        res.json({ paymentId, creditsGranted: result.creditsGranted, status: "paid" });
        return;
      }
      res.redirect(303, "/admin/payments");
    }),
  );

  router.post(
    "/admin/payments/reject",
    express.urlencoded({ extended: false }),
    asyncRoute(async (req, res) => {
      if (!review) {
        res.status(404).json({ error: "qr_disabled" });
        return;
      }
      const paymentId = text(req.body?.paymentId);
      await review.reject(paymentId);
      if (req.is("application/json")) {
        res.json({ paymentId, status: "rejected", creditsGranted: 0 });
        return;
      }
      res.redirect(303, "/admin/payments");
    }),
  );

  router.get("/admin/export.csv", asyncRoute(async (_req, res) => {
    const rows = await log.list(CSV_LIMIT);
    res.type("text/csv").set("content-disposition", "attachment; filename=\"traction.csv\"").send(renderEventsCsv(rows));
  }));

  return router;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function adminToken(): string {
  return (process.env.ADMIN_TOKEN ?? "").trim();
}

function adminCookie(token: string): string {
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

function cookieValue(req: Request, name: string): string {
  const header = req.headers.cookie;
  if (!header) return "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

function sameToken(got: string, expected: string): boolean {
  const left = Buffer.from(got);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function allowAdmin(req: Request, res: Response): boolean {
  const expected = adminToken();
  if (!expected) {
    res.status(503).json({ error: "admin_unconfigured" });
    return false;
  }
  if (sameToken(cookieValue(req, ADMIN_COOKIE), expected)) return true;
  if (req.method === "GET" || req.method === "HEAD") {
    res.status(200).type("html").send(renderLoginHtml());
    return false;
  }
  res.status(401).json({ error: "admin_required" });
  return false;
}

function renderLoginHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"/>${VIEWPORT_META}<title>Chotu admin</title></head>
<body>
<h1>Admin</h1>
<form method="post" action="/admin/login">
<label>Token <input name="token" type="password" autocomplete="current-password" required/></label>
<button type="submit">Sign in</button>
</form>
</body></html>`;
}

function renderPaymentsHtml(pending: PendingPayment[], enabled: boolean): string {
  const rows = pending.length
    ? pending
        .map(
          (row) => `<tr>
<td><code>${escapeHtml(row.id)}</code></td>
<td>${escapeHtml(row.packId)}</td>
<td>₹${row.amountInr}</td>
<td>${row.credits}</td>
<td><code>${escapeHtml(row.utr)}</code></td>
<td>
<form method="post" action="/admin/payments/approve"><input type="hidden" name="paymentId" value="${escapeHtml(row.id)}"/><button type="submit">Approve</button></form>
<form method="post" action="/admin/payments/reject"><input type="hidden" name="paymentId" value="${escapeHtml(row.id)}"/><button type="submit">Reject</button></form>
</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="6">${enabled ? "No payments waiting." : "PhonePe review is off. Set PAYMENTS_MODE=qr."}</td></tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"/>${VIEWPORT_META}<title>Chotu payments</title>
<style>
  body{font-family:system-ui,sans-serif;margin:1rem;line-height:1.4;color:#1a1a1a}
  table{border-collapse:collapse;width:100%}
  th,td{border-bottom:1px solid #ddd;text-align:left;padding:0.4rem;vertical-align:top}
  button{font:inherit;min-height:44px}
  @media (min-width:800px){body{margin:2rem}}
</style></head>
<body>
<p><a href="/admin">Traction</a></p>
<h1>Payments</h1>
<p>Approve credits the ledger once. The ledger ref is the UTR.</p>
<table>
<thead><tr><th>Payment</th><th>Pack</th><th>Amount</th><th>Credits</th><th>UTR</th><th></th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}

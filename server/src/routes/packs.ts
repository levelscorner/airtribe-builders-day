import { Router } from "express";
import {
  BuyPackBodySchema,
  completePackPayment,
  createPackCheckout,
  getCheckout,
  packCatalog,
} from "../payments/packs.js";

export const packsRouter = Router();

packsRouter.get("/packs", (_req, res) => {
  res.json(packCatalog());
});

packsRouter.post("/packs/checkout", (req, res) => {
  const parsed = BuyPackBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const checkout = createPackCheckout(parsed.data.userId);
    res.status(201).json(checkout);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

packsRouter.get("/packs/:id", (req, res) => {
  const c = getCheckout(req.params.id);
  if (!c) {
    res.status(404).json({ error: "Checkout not found" });
    return;
  }
  res.json(c);
});

/** Mock Pine Labs pay completion (also usable as a simple webhook target). */
packsRouter.post("/packs/:id/complete", (req, res) => {
  try {
    const result = completePackPayment(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

packsRouter.get("/packs/:id/mock-pay", (req, res) => {
  try {
    const { checkout, user } = completePackPayment(req.params.id);
    res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"/><title>Pack paid</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font-family:system-ui;max-width:28rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
.ok{color:#2F6B4F;font-weight:700}</style></head>
<body>
<h1 class="ok">Payment recorded (mock)</h1>
<p>₹${checkout.priceInr} → <strong>+${checkout.credits}</strong> credits.</p>
<p>${user.name} now has <strong>${user.credits}</strong> credits.</p>
<p>Close this tab and return to Chotu Studio.</p>
</body></html>`);
  } catch (err) {
    res.status(404).type("html").send(`<p>${err instanceof Error ? err.message : String(err)}</p>`);
  }
});

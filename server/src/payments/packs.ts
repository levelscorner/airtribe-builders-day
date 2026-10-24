import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { env } from "../env.js";
import { addCredits, getUser, toPublicUser } from "../users/store.js";
import { logEvent } from "../events/store.js";

export const BuyPackBodySchema = z.object({
  userId: z.string().uuid(),
});

export interface PackCheckout {
  id: string;
  userId: string;
  credits: number;
  priceInr: number;
  paymentUrl: string;
  status: "pending" | "paid" | "failed";
  mock: boolean;
  createdAt: string;
  paidAt?: string;
}

const checkouts = new Map<string, PackCheckout>();

export function createPackCheckout(userId: string): PackCheckout {
  const user = getUser(userId);
  if (!user) throw new Error("User not found");

  const id = uuidv4();
  const mock = env.pineLabsMock || !env.pineLabsPaymentLinkBase;

  let paymentUrl: string;
  if (mock) {
    paymentUrl = `${env.publicBaseUrl}/api/packs/${id}/mock-pay`;
  } else {
    const base = env.pineLabsPaymentLinkBase.replace(/\/$/, "");
    const sep = base.includes("?") ? "&" : "?";
    paymentUrl = `${base}${sep}order_id=${id}&amount=${env.videoPackPriceInr}&credits=${env.videoPackCredits}&user=${userId}`;
  }

  const checkout: PackCheckout = {
    id,
    userId,
    credits: env.videoPackCredits,
    priceInr: env.videoPackPriceInr,
    paymentUrl,
    status: "pending",
    mock,
    createdAt: new Date().toISOString(),
  };
  checkouts.set(id, checkout);

  logEvent(
    "payment",
    `Checkout started: ₹${checkout.priceInr} → ${checkout.credits} credits (${mock ? "mock" : "Pine Labs link"})`,
    {
      userId,
      meta: { checkoutId: id, mock, priceInr: checkout.priceInr, credits: checkout.credits },
    },
  );

  return checkout;
}

export function getCheckout(id: string): PackCheckout | undefined {
  return checkouts.get(id);
}

/** Complete payment (mock button or webhook). Idempotent. */
export function completePackPayment(checkoutId: string): { checkout: PackCheckout; user: ReturnType<typeof toPublicUser> } {
  const checkout = checkouts.get(checkoutId);
  if (!checkout) throw new Error("Checkout not found");
  if (checkout.status === "paid") {
    return { checkout, user: toPublicUser(getUser(checkout.userId)!) };
  }

  checkout.status = "paid";
  checkout.paidAt = new Date().toISOString();
  const user = addCredits(checkout.userId, checkout.credits, `Video pack purchase ₹${checkout.priceInr}`);

  logEvent(
    "payment",
    `Payment confirmed: ₹${checkout.priceInr} → +${checkout.credits} credits (${checkout.mock ? "mock" : "Pine Labs"})`,
    {
      userId: checkout.userId,
      meta: {
        checkoutId,
        mock: checkout.mock,
        priceInr: checkout.priceInr,
        credits: checkout.credits,
        paidAt: checkout.paidAt,
      },
    },
  );

  return { checkout, user: toPublicUser(user) };
}

export function packCatalog() {
  return {
    name: "Video pack",
    credits: env.videoPackCredits,
    priceInr: env.videoPackPriceInr,
    mock: env.pineLabsMock || !env.pineLabsPaymentLinkBase,
    note: "Credits gate each Chotu Studio generation. Learning creators can later sell mini-courses with the same pack rails.",
  };
}

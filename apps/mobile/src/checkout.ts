import type { CheckoutResponse, CreditPack, ListPacksResponse } from "@chotu/shared";
import { ApiPaths } from "@chotu/shared";
import { getStudioClient } from "./api";
import { isMockStudio } from "./mock-studio";

/**
 * Swap point for Pine Labs checkout.
 * createCheckout(packId) -> { orderId, checkoutUrl? }
 * setCreateCheckout replaces the implementation. The default posts /v1/packs/checkout.
 */
export interface CheckoutSession {
  orderId: string;
  /** Hosted page. The mock-pay URL is opened; a mock:// locator is not. */
  checkoutUrl?: string;
}

export type CreateCheckout = (packId: string) => Promise<CheckoutSession>;

export type PackPaymentStatus = "pending" | "paid" | "mocked" | "failed";

export function sessionFromCheckout(response: CheckoutResponse): CheckoutSession {
  return {
    orderId: response.paymentId,
    checkoutUrl: response.checkoutUrl,
  };
}

export function packsApiBase(env: Record<string, string | undefined> = envRecord()): string {
  // Empty EXPO_PUBLIC_API_URL means same-origin, matching the HTTP studio client.
  if (Object.prototype.hasOwnProperty.call(env, "EXPO_PUBLIC_API_URL") && env.EXPO_PUBLIC_API_URL !== undefined) {
    return env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  }
  const raw = env.PUBLIC_BASE_URL || "http://localhost:8787";
  return raw.replace(/\/$/, "");
}

export function isRemoteCheckout(url: string | undefined): url is string {
  return Boolean(url) && !url!.startsWith("mock:");
}

export function paymentStatusFromPage(html: string): PackPaymentStatus | null {
  const match = /is (pending|paid|mocked|failed)\./.exec(html);
  if (!match) return null;
  return match[1] as PackPaymentStatus;
}

export async function listServerPacks(deps?: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<CreditPack[]> {
  const baseUrl = (deps?.baseUrl ?? packsApiBase()).replace(/\/$/, "");
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl}${ApiPaths.packs}`);
  const body = await readBody(response);
  if (!response.ok) throw new Error(messageFrom(body, `Packs failed (${response.status})`));
  const packs = (body as Partial<ListPacksResponse>).packs;
  if (!Array.isArray(packs)) throw new Error("Packs response did not include packs.");
  return packs;
}

export async function createServerCheckout(
  packId: string,
  deps?: { baseUrl?: string; userId?: string; fetchImpl?: typeof fetch },
): Promise<CheckoutSession> {
  const baseUrl = (deps?.baseUrl ?? packsApiBase()).replace(/\/$/, "");
  const userId = deps?.userId ?? (await getStudioClient().getMe()).id;
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const response = await fetchImpl(`${baseUrl}${ApiPaths.packsCheckout}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": userId,
    },
    body: JSON.stringify({ packId }),
  });
  const body = await readBody(response);
  if (!response.ok) throw new Error(messageFrom(body, `Checkout failed (${response.status})`));
  return sessionFromCheckout(body as CheckoutResponse);
}

export async function pollPackPayment(input: {
  orderId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  attempts?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<PackPaymentStatus> {
  const baseUrl = (input.baseUrl ?? packsApiBase()).replace(/\/$/, "");
  const fetchImpl = input.fetchImpl ?? fetch;
  const attempts = input.attempts ?? 20;
  const intervalMs = input.intervalMs ?? 1500;
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: PackPaymentStatus = "pending";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetchImpl(`${baseUrl}/v1/packs/callback?payment_id=${encodeURIComponent(input.orderId)}`);
    const html = await response.text();
    const status = paymentStatusFromPage(html);
    if (status === "paid" || status === "mocked" || status === "failed") return status;
    if (status) last = status;
    if (attempt < attempts - 1) await sleep(intervalMs);
  }
  return last;
}

export async function openCheckoutUrl(
  url: string,
  openUrl?: (url: string) => void | Promise<void>,
): Promise<void> {
  if (!isRemoteCheckout(url)) return;
  if (openUrl) {
    await openUrl(url);
    return;
  }
  const host = globalThis as { open?: (next: string, target?: string, features?: string) => unknown };
  if (typeof host.open === "function") {
    host.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  throw new Error("Checkout page could not be opened.");
}

export async function applyVisibleCredits(orderId: string, credits: number): Promise<number | null> {
  const client = getStudioClient();
  if (!isMockStudio(client) || credits <= 0) return null;
  return client.noteSettledPack(orderId, credits);
}

/** Opens a remote checkout URL, then polls until the callback page reports a final status. */
export async function finishCheckout(input: {
  session: CheckoutSession;
  credits: number;
  reopen?: boolean;
  openUrl?: (url: string) => void | Promise<void>;
  poll?: (orderId: string) => Promise<PackPaymentStatus>;
  applyCredits?: (orderId: string, credits: number) => number | Promise<number | null>;
}): Promise<"success" | "waiting" | "failed"> {
  if (!isRemoteCheckout(input.session.checkoutUrl)) return "success";
  if (input.reopen !== false) await openCheckoutUrl(input.session.checkoutUrl, input.openUrl);
  const poll = input.poll ?? ((orderId: string) => pollPackPayment({ orderId }));
  const status = await poll(input.session.orderId);
  if (status === "failed") return "failed";
  if (status !== "paid" && status !== "mocked") return "waiting";
  const apply = input.applyCredits ?? applyVisibleCredits;
  if (input.credits > 0) await apply(input.session.orderId, input.credits);
  return "success";
}

let createCheckoutImpl: CreateCheckout = (packId) => createServerCheckout(packId);

export function setCreateCheckout(next: CreateCheckout): void {
  createCheckoutImpl = next;
}

export function createCheckout(packId: string): Promise<CheckoutSession> {
  return createCheckoutImpl(packId);
}

function envRecord(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function messageFrom(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || !("message" in body)) return fallback;
  const message = (body as { message: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

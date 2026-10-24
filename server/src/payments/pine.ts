import { PaymentError } from "./errors.js";

/** UAT only. Production hosts are rejected. */
export const PINE_LABS_UAT_ORIGIN = "https://pluraluat.v2.pinepg.in";

export function assertPineLabsTestOrigin(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new PaymentError("Pine Labs base URL is not a URL", 500, "bad_pine_host");
  }
  if (url.origin !== PINE_LABS_UAT_ORIGIN) {
    throw new PaymentError(
      "Pine Labs checkout is TEST MODE only (pluraluat host)",
      500,
      "live_host_refused",
    );
  }
  return url;
}

export interface PineLabsClient {
  createPaymentLink(input: {
    reference: string;
    amountPaise: number;
    description: string;
    callbackUrl: string;
  }): Promise<{ paymentLinkId: string; paymentLinkUrl: string; status: string }>;
  getPaymentLink(paymentLinkId: string): Promise<{ status: string; amountPaise?: number }>;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export function createPineLabsClient(input: {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  now?: () => number;
}): PineLabsClient {
  const origin = assertPineLabsTestOrigin(input.baseUrl ?? PINE_LABS_UAT_ORIGIN).origin;
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  let cache: TokenCache | null = null;

  async function token(): Promise<string> {
    if (cache && cache.expiresAt > now() + 5_000) return cache.token;
    const response = await fetchImpl(`${origin}/api/auth/v1/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        grant_type: "client_credentials",
      }),
    });
    const body = await readProviderJson(response);
    const access = stringField(body, "access_token") || stringField(body, "token");
    if (!access) throw new PaymentError("Pine Labs UAT token response had no access_token", 502, "provider_error");
    const expiresIn = numberField(body, "expires_in") ?? 300;
    cache = { token: access, expiresAt: now() + expiresIn * 1000 };
    return access;
  }

  return {
    async createPaymentLink(link) {
      const access = await token();
      const response = await fetchImpl(`${origin}/api/pay/v1/payment-links`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${access}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          merchant_payment_link_reference: link.reference,
          payment_link_amount: { value: link.amountPaise, currency: "INR" },
          description: link.description,
          callback_url: link.callbackUrl,
        }),
      });
      const body = await readProviderJson(response);
      const paymentLinkId = stringField(body, "payment_link_id");
      const paymentLinkUrl = stringField(body, "payment_link_url");
      if (!paymentLinkId || !paymentLinkUrl) {
        throw new PaymentError("Pine Labs UAT did not return a payment link", 502, "provider_error");
      }
      const checkout = new URL(paymentLinkUrl);
      if (checkout.protocol !== "https:") {
        throw new PaymentError("Pine Labs returned a non-https payment link", 502, "provider_error");
      }
      return {
        paymentLinkId,
        paymentLinkUrl,
        status: stringField(body, "status") || "CREATED",
      };
    },
    async getPaymentLink(paymentLinkId) {
      const access = await token();
      const response = await fetchImpl(`${origin}/api/pay/v1/payment-links/${encodeURIComponent(paymentLinkId)}`, {
        headers: { authorization: `Bearer ${access}` },
      });
      const body = await readProviderJson(response);
      const amount = body.amount ?? body.payment_link_amount;
      const amountPaise =
        amount && typeof amount === "object" && amount !== null && "value" in amount
          ? numberField(amount as Record<string, unknown>, "value")
          : undefined;
      return { status: stringField(body, "status") || "", amountPaise };
    },
  };
}

async function readProviderJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new PaymentError(`Pine Labs UAT ${response.status}`, 502, "provider_error");
  }
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PaymentError("Pine Labs UAT returned a non-object body", 502, "provider_error");
  }
  return parsed as Record<string, unknown>;
}

function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function numberField(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  return typeof value === "number" ? value : undefined;
}

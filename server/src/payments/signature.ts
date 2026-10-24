import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentError } from "./errors.js";

const MAX_SKEW_SECONDS = 5 * 60;

export interface WebhookSignature {
  webhookId: string;
  webhookTimestamp: string;
  webhookSignature: string;
}

export function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  if (!trimmed || trimmed.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    throw new PaymentError(
      "PINE_LABS_WEBHOOK_SECRET must be the base64 secret from the Pine Labs dashboard",
      500,
      "bad_webhook_secret",
    );
  }
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === 0) {
    throw new PaymentError(
      "PINE_LABS_WEBHOOK_SECRET must be the base64 secret from the Pine Labs dashboard",
      500,
      "bad_webhook_secret",
    );
  }
  return decoded;
}

/** Pine Labs signs `webhook-id.webhook-timestamp.rawBody` with the base64-decoded secret. */
export function pineLabsSignature(input: {
  webhookId: string;
  webhookTimestamp: string;
  rawBody: string;
  secret: Buffer;
}): string {
  const signed = `${input.webhookId}.${input.webhookTimestamp}.${input.rawBody}`;
  return createHmac("sha256", input.secret).update(signed).digest("base64");
}

export function parseSignatureArgument(signature: string | undefined): WebhookSignature | null {
  if (!signature) return null;
  if (signature.startsWith("{")) {
    let parsed: Partial<WebhookSignature>;
    try {
      parsed = JSON.parse(signature) as Partial<WebhookSignature>;
    } catch {
      throw new PaymentError("webhook signature envelope is not valid JSON", 401, "bad_signature");
    }
    return {
      webhookId: parsed.webhookId ?? "",
      webhookTimestamp: parsed.webhookTimestamp ?? "",
      webhookSignature: parsed.webhookSignature ?? "",
    };
  }
  return { webhookId: "", webhookTimestamp: "", webhookSignature: signature };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyPineLabsWebhook(input: {
  rawBody: string;
  signature: string | undefined;
  secret: Buffer;
  now?: Date;
}): WebhookSignature {
  const parsed = parseSignatureArgument(input.signature);
  if (!parsed?.webhookId || !parsed.webhookTimestamp || !parsed.webhookSignature) {
    throw new PaymentError("missing Pine Labs webhook signature", 401, "bad_signature");
  }
  const timestamp = Number(parsed.webhookTimestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > MAX_SKEW_SECONDS) {
    throw new PaymentError("webhook timestamp is outside the allowed window", 401, "stale_webhook");
  }
  const expected = pineLabsSignature({
    webhookId: parsed.webhookId,
    webhookTimestamp: parsed.webhookTimestamp,
    rawBody: input.rawBody,
    secret: input.secret,
  });
  const candidates = parsed.webhookSignature.split(" ").filter(Boolean);
  const matches = candidates.some((candidate) => {
    const value = candidate.startsWith("v1,") ? candidate.slice(3) : candidate;
    return safeEqual(value, expected);
  });
  if (!matches) throw new PaymentError("webhook signature does not match", 401, "bad_signature");
  return parsed;
}

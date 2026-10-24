import type { CreditPack } from "@chotu/shared";

export const PHONEPE_PAYEE = "ABHINAV RANA";

type EnvLike = Record<string, string | undefined>;

// Direct read so Expo inlines this into the web bundle. Empty means same-origin.
const inlinedApiUrl = process.env.EXPO_PUBLIC_API_URL;

/** Empty EXPO_PUBLIC_API_URL means same-origin, which is how the web build talks to npm start. */
export function paymentsApiBase(env?: EnvLike): string {
  if (env && Object.prototype.hasOwnProperty.call(env, "EXPO_PUBLIC_API_URL") && env.EXPO_PUBLIC_API_URL !== undefined) {
    return env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (inlinedApiUrl !== undefined) return inlinedApiUrl.replace(/\/$/, "");
  if (env?.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, "");
  if (typeof document !== "undefined") return "";
  return "http://localhost:8787";
}

export interface PhonePeDeclaration {
  paymentId: string;
  status: string;
  creditsGranted: number;
}

export async function declarePhonePePaid(input: {
  packId: string;
  utr: string;
  userId: string;
  base?: string;
  fetchImpl?: typeof fetch;
}): Promise<PhonePeDeclaration> {
  const response = await (input.fetchImpl ?? fetch)(`${input.base ?? paymentsApiBase()}/v1/packs/phonepe`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-user-id": input.userId,
    },
    body: JSON.stringify({ packId: input.packId, utr: input.utr }),
  });
  const body = (await response.json()) as { message?: string; paymentId?: string; status?: string; creditsGranted?: number };
  if (!response.ok || !body.paymentId) {
    throw new Error(body.message || "Payment save nahi hui.");
  }
  return {
    paymentId: body.paymentId,
    status: body.status || "pending_verification",
    creditsGranted: body.creditsGranted ?? 0,
  };
}

export async function listServerPacks(input?: { base?: string; fetchImpl?: typeof fetch }): Promise<CreditPack[] | null> {
  try {
    const response = await (input?.fetchImpl ?? fetch)(`${input?.base ?? paymentsApiBase()}/v1/packs`, {
      credentials: "include",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { packs?: CreditPack[] };
    return Array.isArray(body.packs) ? body.packs : null;
  } catch {
    return null;
  }
}

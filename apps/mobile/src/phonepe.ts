import type { CreditPack } from "@chotu/shared";

export const PHONEPE_PAYEE = "ABHINAV RANA";

type EnvLike = Record<string, string | undefined>;

/** Empty EXPO_PUBLIC_API_URL means same-origin. The member read must stay direct so Metro inlines it. */
export function paymentsApiBase(env?: EnvLike): string {
  const raw = env ? env.EXPO_PUBLIC_API_URL : process.env.EXPO_PUBLIC_API_URL;
  if (raw !== undefined) return raw.replace(/\/$/, "");
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
    const response = await (input?.fetchImpl ?? fetch)(`${input?.base ?? paymentsApiBase()}/v1/packs`);
    if (!response.ok) return null;
    const body = (await response.json()) as { packs?: CreditPack[] };
    return Array.isArray(body.packs) ? body.packs : null;
  } catch {
    return null;
  }
}

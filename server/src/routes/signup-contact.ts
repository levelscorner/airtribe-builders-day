import { isEmail } from "@chotu/shared";

export type SignupContact =
  | { email: string; phone?: string }
  | { error: "email_required" | "invalid_email" };

/**
 * Email is required. `email` wins. The legacy `phoneOrEmail` field counts when it is an email.
 * Phone is kept only when the request includes one.
 */
export function signupContact(body: {
  email?: string | null;
  phone?: string | null;
  phoneOrEmail?: string | null;
}): SignupContact {
  const explicit = body.email?.trim() ?? "";
  const legacy = body.phoneOrEmail?.trim() ?? "";
  const phone = body.phone?.trim() || undefined;
  if (explicit) {
    if (!isEmail(explicit)) return { error: "invalid_email" };
    return phone ? { email: explicit, phone } : { email: explicit };
  }
  if (legacy) {
    if (!isEmail(legacy)) return { error: "invalid_email" };
    return phone ? { email: legacy, phone } : { email: legacy };
  }
  return { error: "email_required" };
}

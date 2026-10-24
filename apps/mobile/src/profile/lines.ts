import { isEmail, type User } from "@chotu/shared";

/** Name, email, phone, and signup time for the profile sheet. */
export function profileLines(user: User): { name: string; email: string; phone: string; createdAt: string } {
  const legacy = user.phoneOrEmail?.trim() ?? "";
  const email = user.email?.trim() || (isEmail(legacy) ? legacy : "");
  return {
    name: user.displayName,
    email: email || "—",
    phone: user.phone?.trim() || "—",
    createdAt: user.createdAt || "—",
  };
}

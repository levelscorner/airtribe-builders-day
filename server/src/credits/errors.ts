export class InsufficientCreditsError extends Error {
  readonly code = "insufficient_credits" as const;

  constructor(
    readonly balance: number,
    readonly needed: number,
  ) {
    super(`Not enough credits (balance ${balance}, need ${needed})`);
    this.name = "InsufficientCreditsError";
  }
}

export class LedgerError extends Error {
  constructor(
    message: string,
    readonly code:
      | "bad_amount"
      | "user_not_found"
      | "reserve_not_found"
      | "reserve_mismatch"
      | "already_settled"
      | "ref_conflict"
      | "db_required",
  ) {
    super(message);
    this.name = "LedgerError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "23505") return true;
  const message = (error as { message?: string }).message ?? "";
  return message.toLowerCase().includes("duplicate key");
}

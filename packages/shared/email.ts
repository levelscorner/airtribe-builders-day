/** An address with a local part, a domain, and a dot. Spaces are rejected. */
export function isEmail(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

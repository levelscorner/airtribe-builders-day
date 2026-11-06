/** Demo billing. Unset, blank, or anything other than 1/true/yes/on stays off. */
export function creditsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.CREDITS_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

const IST = "Asia/Kolkata";

/** Readable Asia/Kolkata time, for example "24 Oct, 6:32 PM IST". Missing or invalid input is "—". */
export function formatIst(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const day = read("day");
  const month = read("month").replace(".", "");
  const hour = read("hour");
  const minute = read("minute");
  const period = read("dayPeriod").toUpperCase();
  if (!day || !month || !hour || !minute || !period) return "—";
  return `${day} ${month}, ${hour}:${minute} ${period} IST`;
}

/** Last active when it was recorded, otherwise signup, otherwise an em dash. */
export function formatLastActive(lastActiveAt: string | null | undefined, createdAt: string | null | undefined): string {
  return formatIst(lastActiveAt || createdAt);
}

import { VIEWPORT_META } from "../html.js";
import type { Db } from "../credits/db.js";
import { escapeHtml } from "./format.js";

/**
 * Studio order, not the order a person might list the names.
 * A video at cast has not reached script yet. Final is after voice
 * and is not finished. Visuals covers prompts, images, and clips.
 */
const STAGE_BUCKET = {
  brief: "brief",
  cast: "cast",
  script: "script",
  prompts: "visuals",
  images: "visuals",
  clips: "visuals",
  audio: "voice",
  final: "final",
  done: "done",
} as const;

type StageBucket = (typeof STAGE_BUCKET)[keyof typeof STAGE_BUCKET];

const FUNNEL_RANK: Record<StageBucket, number> = {
  brief: 0,
  cast: 1,
  script: 2,
  visuals: 3,
  voice: 4,
  final: 5,
  done: 6,
};

const FUNNEL_STEPS = ["brief", "cast", "script", "visuals", "voice", "done"] as const;
type FunnelStep = (typeof FUNNEL_STEPS)[number];

const RECENT_LIMIT = 20;

export interface UsageUser {
  name: string;
  email: string;
  signedUpAt: string;
  videos: number;
  credits: number;
}

export interface FailureGroup {
  stage: string;
  provider: string;
  failedArtefacts: number;
  failedJobs: number;
}

export interface FailureEvent {
  at: string;
  stage: string;
  provider: string;
  kind: string;
  message: string;
  videoId: string;
}

export interface StuckJob {
  videoId: string;
  stage: string;
  since: string;
  minutes: number;
}

export interface ErrorWindow {
  failed: number;
  total: number;
  rate: number;
}

export interface FailureReport {
  groups: FailureGroup[];
  latest: FailureEvent[];
  stuck: StuckJob[];
  errorRate: { lastHour: ErrorWindow; last24Hours: ErrorWindow };
}

export interface UsageReport {
  excludeTestAccounts: boolean;
  database: boolean;
  generatedAt: string;
  signups: { total: number; today: number; last7Days: number };
  dailyActiveUsers: number;
  chatsStarted: number;
  videosByStage: Record<StageBucket, number>;
  funnel: Record<FunnelStep, number>;
  videosFinished: number;
  credits: { granted: number; spent: number; refunded: number };
  qrPayments: { pending: number; approved: number; revenueInr: number };
  failures: FailureReport;
  recentUsers: UsageUser[];
}

export function bucketForStage(stage: string): StageBucket | null {
  return STAGE_BUCKET[stage as keyof typeof STAGE_BUCKET] ?? null;
}

export function isTestAccount(phoneOrEmail: string | null | undefined): boolean {
  if (!phoneOrEmail) return false;
  const email = phoneOrEmail.trim().toLowerCase();
  if (!email) return false;
  if (email.endsWith("@example.com")) return true;
  const at = email.indexOf("@");
  const local = at === -1 ? email : email.slice(0, at);
  return local.startsWith("marsqa+");
}

/** First character of the local part and the host, then the real TLD. */
export function maskEmail(phoneOrEmail: string | null | undefined): string {
  if (!phoneOrEmail) return "";
  const raw = phoneOrEmail.trim();
  const at = raw.indexOf("@");
  if (at <= 0 || at === raw.length - 1) return "";
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  if (dot <= 0 || dot === domain.length - 1) return "";
  const host = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);
  if (!local[0] || !host[0] || !tld) return "";
  return `${local[0]}***@${host[0]}***.${tld}`;
}

export async function loadUsage(
  db: Db | undefined,
  options: { excludeTestAccounts: boolean; now?: Date },
): Promise<UsageReport> {
  const now = options.now ?? new Date();
  if (!db) return emptyReport(options.excludeTestAccounts, false, now);

  const [users, chats, videos, ledger, payments, events] = await Promise.all([
    db.query<UserRow>(
      "SELECT id, display_name, phone_or_email, credit_balance, created_at FROM users",
    ),
    db.query<ChatRow>("SELECT id, user_id, created_at FROM chats"),
    db.query<VideoRow>("SELECT id, user_id, stage, status, updated_at FROM videos"),
    db.query<LedgerRow>("SELECT user_id, delta, reason FROM credit_ledger"),
    db.query<PaymentRow>("SELECT user_id, amount_inr, provider, status FROM payments"),
    db.query<EventRow>("SELECT user_id, created_at FROM events"),
  ]);
  const messages = await loadMessages(db);
  const artefacts = await loadArtefacts(db);

  const todayStart = startOfUtcDay(now);
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const kept = new Set<string>();
  for (const user of users.rows) {
    if (options.excludeTestAccounts && isTestAccount(user.phone_or_email)) continue;
    kept.add(String(user.id));
  }

  const report = emptyReport(options.excludeTestAccounts, true, now);
  const videoCount = new Map<string, number>();
  const active = new Set<string>();

  for (const user of users.rows) {
    const id = String(user.id);
    if (!kept.has(id)) continue;
    report.signups.total += 1;
    const created = asDate(user.created_at);
    if (created && created.getTime() >= todayStart.getTime()) report.signups.today += 1;
    if (created && created.getTime() >= weekStart.getTime()) report.signups.last7Days += 1;
  }

  for (const chat of chats.rows) {
    const id = String(chat.user_id);
    if (!kept.has(id)) continue;
    report.chatsStarted += 1;
    if (onOrAfter(chat.created_at, todayStart)) active.add(id);
  }

  for (const video of videos.rows) {
    const id = String(video.user_id);
    if (!kept.has(id)) continue;
    videoCount.set(id, (videoCount.get(id) ?? 0) + 1);
    const bucket = bucketForStage(String(video.stage));
    if (!bucket) continue;
    report.videosByStage[bucket] += 1;
    const rank = FUNNEL_RANK[bucket];
    for (const step of FUNNEL_STEPS) {
      if (rank >= FUNNEL_RANK[step]) report.funnel[step] += 1;
    }
    if (bucket === "done") report.videosFinished += 1;
    if (onOrAfter(video.updated_at, todayStart)) active.add(id);
  }

  for (const entry of ledger.rows) {
    if (!kept.has(String(entry.user_id))) continue;
    const delta = asInt(entry.delta);
    const reason = String(entry.reason);
    if (delta > 0 && (reason === "signup_grant" || reason === "pack_purchase")) {
      report.credits.granted += delta;
    } else if (delta < 0 && isSpend(reason)) {
      report.credits.spent += -delta;
    } else if (delta > 0 && (reason === "refund" || reason === "settle")) {
      report.credits.refunded += delta;
    }
  }

  for (const payment of payments.rows) {
    if (!kept.has(String(payment.user_id))) continue;
    if (String(payment.provider).toLowerCase() !== "phonepe") continue;
    const status = String(payment.status);
    if (status === "pending_verification") report.qrPayments.pending += 1;
    if (status === "paid") {
      report.qrPayments.approved += 1;
      report.qrPayments.revenueInr += asInt(payment.amount_inr);
    }
  }

  for (const event of events.rows) {
    if (!event.user_id) continue;
    const id = String(event.user_id);
    if (!kept.has(id)) continue;
    if (onOrAfter(event.created_at, todayStart)) active.add(id);
  }

  for (const message of messages) {
    const id = String(message.user_id);
    if (!kept.has(id)) continue;
    if (onOrAfter(message.created_at, todayStart)) active.add(id);
  }

  report.dailyActiveUsers = active.size;
  report.failures = buildFailures(videos.rows, artefacts, kept, now);
  report.recentUsers = users.rows
    .filter((user) => kept.has(String(user.id)))
    .sort((a, b) => {
      const diff = (asDate(b.created_at)?.getTime() ?? 0) - (asDate(a.created_at)?.getTime() ?? 0);
      if (diff !== 0) return diff;
      return String(a.id) < String(b.id) ? -1 : 1;
    })
    .slice(0, RECENT_LIMIT)
    .map((user) => ({
      name: String(user.display_name ?? ""),
      email: maskEmail(user.phone_or_email),
      signedUpAt: asDate(user.created_at)?.toISOString() ?? "",
      videos: videoCount.get(String(user.id)) ?? 0,
      credits: asInt(user.credit_balance),
    }));

  return report;
}

export function renderUsageHtml(report: UsageReport): string {
  const query = report.excludeTestAccounts ? "" : "?includeTests=1";
  const toggle = report.excludeTestAccounts
    ? `<a href="/admin/usage?includeTests=1">Show test accounts</a>`
    : `<a href="/admin/usage">Hide test accounts</a>`;
  const hidden = report.excludeTestAccounts
    ? "Test accounts are hidden (marsqa+ and @example.com)."
    : "Test accounts are included.";
  const database = report.database ? "" : "<p>Database not connected.</p>";
  const stages = (Object.keys(report.videosByStage) as StageBucket[])
    .map((stage) => `<li>Stage ${escapeHtml(stage)}: ${report.videosByStage[stage]}</li>`)
    .join("");
  const funnel = FUNNEL_STEPS.map((step) => `<li>Funnel ${escapeHtml(step)}: ${report.funnel[step]}</li>`).join("");
  const groups = report.failures.groups.length
    ? report.failures.groups
        .map(
          (group) => `<tr>
<td>${escapeHtml(group.stage)}</td>
<td>${escapeHtml(group.provider)}</td>
<td>${group.failedArtefacts}</td>
<td>${group.failedJobs}</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="4">No failed artefacts.</td></tr>`;
  const latest = report.failures.latest.length
    ? report.failures.latest
        .map(
          (row) => `<tr>
<td>${escapeHtml(row.at)}</td>
<td>${escapeHtml(row.stage)}</td>
<td>${escapeHtml(row.provider)}</td>
<td>${escapeHtml(row.kind)}</td>
<td>${escapeHtml(row.message)}</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No errors yet.</td></tr>`;
  const stuck = report.failures.stuck.length
    ? report.failures.stuck
        .map(
          (row) => `<tr>
<td><code>${escapeHtml(row.videoId)}</code></td>
<td>${escapeHtml(row.stage)}</td>
<td>${escapeHtml(row.since)}</td>
<td>${row.minutes}</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="4">No jobs stuck.</td></tr>`;
  const hour = report.failures.errorRate.lastHour;
  const day = report.failures.errorRate.last24Hours;
  const recent = report.recentUsers.length
    ? report.recentUsers
        .map(
          (user) => `<tr>
<td>${escapeHtml(user.name)}</td>
<td>${escapeHtml(user.email)}</td>
<td>${escapeHtml(user.signedUpAt)}</td>
<td>${user.videos}</td>
<td>${user.credits}</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No users yet.</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"/>${VIEWPORT_META}<title>Chotu usage</title>
<style>
  body{font-family:system-ui,sans-serif;margin:1rem;line-height:1.4;color:#1a1a1a}
  table{border-collapse:collapse;width:100%}
  th,td{border-bottom:1px solid #ddd;text-align:left;padding:0.4rem;vertical-align:top}
  a{min-height:44px}
  @media (min-width:800px){body{margin:2rem}}
</style></head>
<body>
<p><a href="/admin">Traction</a> · <a href="/admin/payments">Payments</a> · <a href="/admin/usage.json${query}">JSON</a> · <a href="/admin/usage.csv${query}">Download CSV</a></p>
<h1>Usage</h1>
${database}
<p>${hidden} ${toggle}</p>
<ul>
<li>Signups total: ${report.signups.total}</li>
<li>Signups today: ${report.signups.today}</li>
<li>Signups last 7 days: ${report.signups.last7Days}</li>
<li>Daily active users: ${report.dailyActiveUsers}</li>
<li>Chats started: ${report.chatsStarted}</li>
<li>Videos finished: ${report.videosFinished}</li>
</ul>
<h2>Videos by stage</h2>
<p>Studio order is brief, cast, script, visuals (prompts, images, clips), voice, final, done.</p>
<ul>${stages}</ul>
<h2>Completion funnel</h2>
<p>Each count is videos that have reached that step or gone further. Final is after voice and is not finished.</p>
<ul>${funnel}</ul>
<h2>Credits</h2>
<ul>
<li>Credits granted: ${report.credits.granted}</li>
<li>Credits spent: ${report.credits.spent}</li>
<li>Credits refunded: ${report.credits.refunded}</li>
</ul>
<p>Granted is signup and pack credits. Spent is reserves, regenerates, and new cast members. Refunded includes unused reserve returned at settle.</p>
<h2>QR payments</h2>
<ul>
<li>QR pending: ${report.qrPayments.pending}</li>
<li>QR approved: ${report.qrPayments.approved}</li>
<li>QR revenue: ₹${report.qrPayments.revenueInr}</li>
</ul>
<h2>Failures</h2>
<p>Error rate last hour: ${percent(hour)} (${hour.failed} of ${hour.total}). Last 24 hours: ${percent(day)} (${day.failed} of ${day.total}).</p>
<p>The rate is failed artefacts among artefacts updated in that window. With no artefact updates, it uses videos whose status is failed.</p>
<table>
<thead><tr><th>Stage</th><th>Provider</th><th>Failed artefacts</th><th>Failed jobs</th></tr></thead>
<tbody>${groups}</tbody>
</table>
<h3>Latest errors</h3>
<table>
<thead><tr><th>When</th><th>Stage</th><th>Provider</th><th>Kind</th><th>Message</th></tr></thead>
<tbody>${latest}</tbody>
</table>
<h3>Stuck more than 5 minutes</h3>
<p>Active videos that are not done and have not moved stage.</p>
<table>
<thead><tr><th>Video</th><th>Stage</th><th>Since</th><th>Minutes</th></tr></thead>
<tbody>${stuck}</tbody>
</table>
<h2>Recent users</h2>
<table>
<thead><tr><th>Name</th><th>Email</th><th>Signed up</th><th>Videos</th><th>Credits</th></tr></thead>
<tbody>${recent}</tbody>
</table>
</body></html>`;
}

export function renderUsageCsv(report: UsageReport): string {
  const metrics: Array<[string, string | number]> = [
    ["exclude_test_accounts", report.excludeTestAccounts ? "true" : "false"],
    ["database", report.database ? "true" : "false"],
    ["signups_total", report.signups.total],
    ["signups_today", report.signups.today],
    ["signups_last_7_days", report.signups.last7Days],
    ["daily_active_users", report.dailyActiveUsers],
    ["chats_started", report.chatsStarted],
    ["videos_finished", report.videosFinished],
    ["videos_stage_brief", report.videosByStage.brief],
    ["videos_stage_cast", report.videosByStage.cast],
    ["videos_stage_script", report.videosByStage.script],
    ["videos_stage_visuals", report.videosByStage.visuals],
    ["videos_stage_voice", report.videosByStage.voice],
    ["videos_stage_final", report.videosByStage.final],
    ["videos_stage_done", report.videosByStage.done],
    ["funnel_brief", report.funnel.brief],
    ["funnel_cast", report.funnel.cast],
    ["funnel_script", report.funnel.script],
    ["funnel_visuals", report.funnel.visuals],
    ["funnel_voice", report.funnel.voice],
    ["funnel_done", report.funnel.done],
    ["credits_granted", report.credits.granted],
    ["credits_spent", report.credits.spent],
    ["credits_refunded", report.credits.refunded],
    ["qr_pending", report.qrPayments.pending],
    ["qr_approved", report.qrPayments.approved],
    ["qr_revenue_inr", report.qrPayments.revenueInr],
    ["failed_artefacts", report.failures.groups.reduce((sum, group) => sum + group.failedArtefacts, 0)],
    ["failed_jobs", report.failures.groups.reduce((sum, group) => sum + group.failedJobs, 0)],
    ["stuck_jobs", report.failures.stuck.length],
    ["error_failed_hour", report.failures.errorRate.lastHour.failed],
    ["error_total_hour", report.failures.errorRate.lastHour.total],
    ["error_rate_hour", report.failures.errorRate.lastHour.rate],
    ["error_failed_24h", report.failures.errorRate.last24Hours.failed],
    ["error_total_24h", report.failures.errorRate.last24Hours.total],
    ["error_rate_24h", report.failures.errorRate.last24Hours.rate],
  ];
  const lines = [["metric", "value"].map(csvCell).join(",")];
  for (const [metric, value] of metrics) lines.push([metric, String(value)].map(csvCell).join(","));
  lines.push("");
  lines.push(["name", "email", "signed_up_at", "videos", "credits"].map(csvCell).join(","));
  for (const user of report.recentUsers) {
    lines.push(
      [user.name, user.email, user.signedUpAt, String(user.videos), String(user.credits)].map(csvCell).join(","),
    );
  }
  lines.push("");
  lines.push(["stage", "provider", "failed_artefacts", "failed_jobs"].map(csvCell).join(","));
  for (const group of report.failures.groups) {
    lines.push(
      [group.stage, group.provider, String(group.failedArtefacts), String(group.failedJobs)].map(csvCell).join(","),
    );
  }
  lines.push("");
  lines.push(["at", "stage", "provider", "kind", "message", "video_id"].map(csvCell).join(","));
  for (const row of report.failures.latest) {
    lines.push([row.at, row.stage, row.provider, row.kind, row.message, row.videoId].map(csvCell).join(","));
  }
  lines.push("");
  lines.push(["video_id", "stage", "since", "minutes"].map(csvCell).join(","));
  for (const row of report.failures.stuck) {
    lines.push([row.videoId, row.stage, row.since, String(row.minutes)].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

interface UserRow {
  id: string;
  display_name: string;
  phone_or_email: string | null;
  credit_balance: number | string;
  created_at: Date | string;
}

interface ChatRow {
  id: string;
  user_id: string;
  created_at: Date | string;
}

interface VideoRow {
  id: string;
  user_id: string;
  stage: string;
  status: string;
  updated_at: Date | string;
}

interface ArtefactRow {
  id: string;
  video_id: string;
  kind: string;
  state: string;
  payload: unknown;
  updated_at: Date | string;
}

interface LedgerRow {
  user_id: string;
  delta: number | string;
  reason: string;
}

interface PaymentRow {
  user_id: string;
  amount_inr: number | string;
  provider: string;
  status: string;
}

interface EventRow {
  user_id: string | null;
  created_at: Date | string;
}

interface MessageRow {
  user_id: string;
  created_at: Date | string;
}

function emptyReport(excludeTestAccounts: boolean, database: boolean, now: Date): UsageReport {
  return {
    excludeTestAccounts,
    database,
    generatedAt: now.toISOString(),
    signups: { total: 0, today: 0, last7Days: 0 },
    dailyActiveUsers: 0,
    chatsStarted: 0,
    videosByStage: { brief: 0, cast: 0, script: 0, visuals: 0, voice: 0, final: 0, done: 0 },
    funnel: { brief: 0, cast: 0, script: 0, visuals: 0, voice: 0, done: 0 },
    videosFinished: 0,
    credits: { granted: 0, spent: 0, refunded: 0 },
    qrPayments: { pending: 0, approved: 0, revenueInr: 0 },
    failures: emptyFailures(),
    recentUsers: [],
  };
}

function emptyFailures(): FailureReport {
  const empty = { failed: 0, total: 0, rate: 0 };
  return { groups: [], latest: [], stuck: [], errorRate: { lastHour: empty, last24Hours: { ...empty } } };
}

const STUCK_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FAILURE_LIMIT = 20;

async function loadMessages(db: Db): Promise<MessageRow[]> {
  try {
    const result = await db.query<MessageRow>(
      `SELECT c.user_id, m.created_at
         FROM messages m
         JOIN chats c ON c.id = m.chat_id`,
    );
    return result.rows;
  } catch (error) {
    if (isMissingRelation(error, "messages")) return [];
    throw error;
  }
}

async function loadArtefacts(db: Db): Promise<ArtefactRow[]> {
  try {
    const result = await db.query<ArtefactRow>(
      "SELECT id, video_id, kind, state, payload, updated_at FROM artefacts",
    );
    return result.rows;
  } catch (error) {
    if (isMissingRelation(error, "artefacts")) return [];
    throw error;
  }
}

function isMissingRelation(error: unknown, table: string): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  const missing = new RegExp(`relation ["']?${table}["']? does not exist`, "i");
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; message?: unknown; cause?: unknown };
    const message = typeof record.message === "string" ? record.message : "";
    if (missing.test(message) || (String(record.code ?? "") === "42P01" && message.toLowerCase().includes(table))) {
      return true;
    }
    current = record.cause;
  }
  return false;
}

function buildFailures(videos: VideoRow[], artefacts: ArtefactRow[], kept: Set<string>, now: Date): FailureReport {
  const videoById = new Map<string, VideoRow>();
  for (const video of videos) {
    if (!kept.has(String(video.user_id))) continue;
    videoById.set(String(video.id), video);
  }

  const groups = new Map<string, FailureGroup>();
  const latest: FailureEvent[] = [];
  const failedArtefactsByVideo = new Map<string, ArtefactRow[]>();

  for (const artefact of artefacts) {
    const video = videoById.get(String(artefact.video_id));
    if (!video || artefact.state !== "failed") continue;
    const stage = failureStage(artefact, video);
    const provider = providerName(artefact.payload);
    const group = takeGroup(groups, stage, provider);
    group.failedArtefacts += 1;
    const list = failedArtefactsByVideo.get(String(video.id)) ?? [];
    list.push(artefact);
    failedArtefactsByVideo.set(String(video.id), list);
    latest.push({
      at: asDate(artefact.updated_at)?.toISOString() ?? "",
      stage,
      provider,
      kind: String(artefact.kind),
      message: errorMessage(artefact.payload),
      videoId: String(video.id),
    });
  }

  for (const video of videoById.values()) {
    if (String(video.status) !== "failed") continue;
    const related = failedArtefactsByVideo.get(String(video.id)) ?? [];
    const newest = [...related].sort((a, b) => timeOf(b.updated_at) - timeOf(a.updated_at))[0];
    const stage = String(video.stage);
    const provider = newest ? providerName(newest.payload) : "unknown";
    takeGroup(groups, stage, provider).failedJobs += 1;
    if (!newest) {
      latest.push({
        at: asDate(video.updated_at)?.toISOString() ?? "",
        stage,
        provider,
        kind: "video",
        message: "Video failed",
        videoId: String(video.id),
      });
    }
  }

  const stuck = [...videoById.values()]
    .filter((video) => String(video.status) === "active" && String(video.stage) !== "done")
    .map((video) => {
      const since = asDate(video.updated_at);
      const elapsed = since ? now.getTime() - since.getTime() : 0;
      return { video, since, elapsed };
    })
    .filter((row) => row.elapsed > STUCK_MS)
    .sort((a, b) => b.elapsed - a.elapsed)
    .slice(0, FAILURE_LIMIT)
    .map((row) => ({
      videoId: String(row.video.id),
      stage: String(row.video.stage),
      since: row.since?.toISOString() ?? "",
      minutes: Math.floor(row.elapsed / 60000),
    }));

  latest.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return {
    groups: [...groups.values()].sort((a, b) => a.stage.localeCompare(b.stage) || a.provider.localeCompare(b.provider)),
    latest: latest.slice(0, FAILURE_LIMIT),
    stuck,
    errorRate: {
      lastHour: errorWindow(artefacts, videoById, now.getTime() - HOUR_MS),
      last24Hours: errorWindow(artefacts, videoById, now.getTime() - DAY_MS),
    },
  };
}

function errorWindow(artefacts: ArtefactRow[], videoById: Map<string, VideoRow>, startMs: number): ErrorWindow {
  let failed = 0;
  let total = 0;
  for (const artefact of artefacts) {
    if (!videoById.has(String(artefact.video_id))) continue;
    if (timeOf(artefact.updated_at) < startMs) continue;
    total += 1;
    if (artefact.state === "failed") failed += 1;
  }
  if (total === 0) {
    for (const video of videoById.values()) {
      if (timeOf(video.updated_at) < startMs) continue;
      total += 1;
      if (String(video.status) === "failed") failed += 1;
    }
  }
  return { failed, total, rate: total === 0 ? 0 : Math.round((failed / total) * 10000) / 10000 };
}

function takeGroup(groups: Map<string, FailureGroup>, stage: string, provider: string): FailureGroup {
  const key = `${stage}\n${provider}`;
  const existing = groups.get(key);
  if (existing) return existing;
  const created = { stage, provider, failedArtefacts: 0, failedJobs: 0 };
  groups.set(key, created);
  return created;
}

function failureStage(artefact: ArtefactRow, video: VideoRow): string {
  const record = asRecord(artefact.payload);
  const named = record?.failedStage;
  if (typeof named === "string" && named.trim()) return named.trim();
  if (video.stage) return String(video.stage);
  return String(artefact.kind);
}

function providerName(payload: unknown): string {
  const record = asRecord(payload);
  const provider = record?.provider;
  if (typeof provider === "string" && provider.trim()) return provider.trim().toLowerCase();
  const label = record?.providerLabel;
  if (typeof label === "string" && label.trim()) return label.trim();
  return "unknown";
}

function errorMessage(payload: unknown): string {
  const record = asRecord(payload);
  return clip(messageOf(record?.error) || messageOf(record?.message) || "failed");
}

function messageOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") return record.message;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 240 ? `${flat.slice(0, 237)}...` : flat;
}

function timeOf(value: unknown): number {
  return asDate(value)?.getTime() ?? 0;
}

function percent(window: ErrorWindow): string {
  if (window.total === 0) return "0%";
  return `${Math.round((window.failed / window.total) * 100)}%`;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function onOrAfter(value: unknown, start: Date): boolean {
  const date = asDate(value);
  return date !== null && date.getTime() >= start.getTime();
}

function isSpend(reason: string): boolean {
  return reason === "reserve" || reason === "regenerate" || reason === "cast_create" || reason === "settle";
}

function asInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return 0;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

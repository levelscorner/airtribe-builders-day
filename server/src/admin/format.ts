import { VIEWPORT_META } from "../html.js";
import type { EventRow } from "./log.js";
import type { AdminUser, AdminUserVideo } from "./users.js";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderAdminHtml(input: {
  rows: EventRow[];
  counts: Array<{ kind: string; n: number }>;
  users: AdminUser[];
  mock: boolean;
  database: boolean;
}): string {
  const total = input.counts.reduce((sum, row) => sum + row.n, 0);
  const counts = input.counts
    .map((row) => `<li>${escapeHtml(row.kind)}: ${row.n}</li>`)
    .join("");
  const body = input.rows.length
    ? input.rows
        .map(
          (row) => `<tr>
<td>${escapeHtml(row.createdAt)}</td>
<td>${escapeHtml(row.kind)}</td>
<td>${escapeHtml(row.userId ?? "")}</td>
<td>${escapeHtml(row.videoId ?? "")}</td>
<td><code>${escapeHtml(JSON.stringify(row.payload))}</code></td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No events yet.</td></tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"/>${VIEWPORT_META}<title>Chotu traction</title>
<style>
  body{font-family:system-ui,sans-serif;margin:1rem;line-height:1.4;color:#1a1a1a}
  table{border-collapse:collapse;width:100%}
  th,td{border-bottom:1px solid #ddd;text-align:left;padding:0.4rem;vertical-align:top}
  code{font-size:0.85em;word-break:break-all}
  a,button{min-height:44px}
  @media (min-width:800px){body{margin:2rem}}
</style></head>
<body>
<h1>Traction</h1>
<p>${total} events. Mock ${input.mock ? "on" : "off"}. Database ${input.database ? "connected" : "in memory"}.</p>
<ul>${counts || "<li>No events yet.</li>"}</ul>
<p><a href="/admin/payments">Payments</a> · <a href="/admin/export.csv">Download CSV</a></p>
<h2>Users</h2>
<table>
<thead><tr><th>display_name</th><th>phone_or_email</th><th>created_at</th></tr></thead>
<tbody>${renderUserRows(input.users)}</tbody>
</table>
<table>
<thead><tr><th>When</th><th>Kind</th><th>User</th><th>Video</th><th>Payload</th></tr></thead>
<tbody>${body}</tbody>
</table>
</body></html>`;
}

function renderUserRows(users: AdminUser[]): string {
  if (users.length === 0) return `<tr><td colspan="3">No users yet.</td></tr>`;
  return users
    .map((user) => {
      const href = `/admin/users/${encodeURIComponent(user.id)}`;
      return `<tr>
<td><a href="${escapeHtml(href)}">${escapeHtml(user.displayName)}</a></td>
<td><a href="${escapeHtml(href)}">${escapeHtml(user.phoneOrEmail) || "—"}</a></td>
<td><a href="${escapeHtml(href)}">${escapeHtml(user.createdAt)}</a></td>
</tr>`;
    })
    .join("");
}

export function renderUserPage(user: AdminUser, videos: AdminUserVideo[]): string {
  const rows = videos.length
    ? videos
        .map(
          (video) => `<tr>
<td><code>${escapeHtml(video.id)}</code></td>
<td>${escapeHtml(video.title || "Untitled")}</td>
<td>${escapeHtml(video.status)}</td>
<td>${escapeHtml(video.stage)}</td>
</tr>`,
        )
        .join("")
    : `<tr><td colspan="4">No videos yet.</td></tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"/>${VIEWPORT_META}<title>${escapeHtml(user.displayName)}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:1rem;line-height:1.4;color:#1a1a1a}
  table{border-collapse:collapse;width:100%}
  th,td{border-bottom:1px solid #ddd;text-align:left;padding:0.4rem;vertical-align:top}
  a,button{min-height:44px}
  @media (min-width:800px){body{margin:2rem}}
</style></head>
<body>
<p><a href="/admin">Traction</a></p>
<h1>${escapeHtml(user.displayName)}</h1>
<p>phone_or_email: ${escapeHtml(user.phoneOrEmail) || "—"}</p>
<p>created_at: ${escapeHtml(user.createdAt)}</p>
<h2>Videos</h2>
<table>
<thead><tr><th>Video</th><th>Title</th><th>Status</th><th>Stage</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;
}

export function renderMissingUser(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"/>${VIEWPORT_META}<title>No such user</title></head>
<body><p><a href="/admin">Traction</a></p><h1>No such user</h1></body></html>`;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function renderEventsCsv(rows: EventRow[]): string {
  const header = ["id", "created_at", "kind", "user_id", "video_id", "payload"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.createdAt,
        row.kind,
        row.userId ?? "",
        row.videoId ?? "",
        JSON.stringify(row.payload),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** User rows follow the event table. Every field is quoted, and quotes are doubled. */
export function renderUsersCsv(users: AdminUser[]): string {
  const lines = [["display_name", "phone_or_email", "created_at"].join(",")];
  for (const user of users) {
    lines.push([user.displayName, user.phoneOrEmail, user.createdAt].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function renderAdminCsv(events: EventRow[], users: AdminUser[]): string {
  return `${renderEventsCsv(events)}${renderUsersCsv(users)}`;
}

import type { Db } from "../credits/db.js";

export interface AdminUser {
  id: string;
  displayName: string;
  phoneOrEmail: string;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface AdminUserVideo {
  id: string;
  title: string;
  status: string;
  stage: string;
  createdAt: string;
}

export interface UserDirectory {
  list(limit: number): Promise<AdminUser[]>;
  get(id: string): Promise<AdminUser | null>;
  videos(userId: string): Promise<AdminUserVideo[]>;
}

export function createUserDirectory(db: Db): UserDirectory {
  return {
    async list(limit) {
      const result = await db.query<{
        id: string;
        display_name: string;
        phone_or_email: string | null;
        created_at: Date | string;
        last_active_at: Date | string | null;
      }>(
        `SELECT id, display_name, phone_or_email, created_at, last_active_at
         FROM users
         ORDER BY created_at DESC, display_name ASC
         LIMIT $1`,
        [limit],
      );
      return result.rows.map(toUser);
    },
    async get(id) {
      const result = await db.query<{
        id: string;
        display_name: string;
        phone_or_email: string | null;
        created_at: Date | string;
        last_active_at: Date | string | null;
      }>(
        `SELECT id, display_name, phone_or_email, created_at, last_active_at
         FROM users
         WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row ? toUser(row) : null;
    },
    async videos(userId) {
      const result = await db.query<{
        id: string;
        title: string | null;
        status: string;
        stage: string;
        created_at: Date | string;
      }>(
        `SELECT v.id, v.status, v.stage, v.created_at, c.title
         FROM videos v
         LEFT JOIN chats c ON c.id = v.chat_id
         WHERE v.user_id = $1
         ORDER BY v.created_at DESC
         LIMIT 50`,
        [userId],
      );
      return result.rows.map((row) => ({
        id: String(row.id),
        title: row.title ?? "",
        status: row.status,
        stage: row.stage,
        createdAt: asIso(row.created_at),
      }));
    },
  };
}

function toUser(row: {
  id: string;
  display_name: string;
  phone_or_email: string | null;
  created_at: Date | string;
  last_active_at?: Date | string | null;
}): AdminUser {
  return {
    id: String(row.id),
    displayName: row.display_name,
    phoneOrEmail: row.phone_or_email ?? "",
    createdAt: asIso(row.created_at),
    lastActiveAt: row.last_active_at == null || row.last_active_at === "" ? null : asIso(row.last_active_at),
  };
}

function asIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

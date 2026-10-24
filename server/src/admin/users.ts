import type { Db } from "../credits/db.js";

export interface AdminUser {
  displayName: string;
  phoneOrEmail: string;
  createdAt: string;
}

export interface UserDirectory {
  list(limit: number): Promise<AdminUser[]>;
}

export function createUserDirectory(db: Db): UserDirectory {
  return {
    async list(limit) {
      const result = await db.query<{
        display_name: string;
        phone_or_email: string | null;
        created_at: Date | string;
      }>(
        `SELECT display_name, phone_or_email, created_at
         FROM users
         ORDER BY created_at DESC, display_name ASC
         LIMIT $1`,
        [limit],
      );
      return result.rows.map((row) => ({
        displayName: row.display_name,
        phoneOrEmail: row.phone_or_email ?? "",
        createdAt: asIso(row.created_at),
      }));
    },
  };
}

function asIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

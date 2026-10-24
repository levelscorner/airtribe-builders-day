/**
 * Apply SQL migrations + seed.
 *   MOCK=1 npm run db:migrate
 *   DATABASE_URL=postgres://… npm run db:migrate
 */
import { migrate, getDb, resetDbForTests } from "./client.js";

const standalone = process.argv[1]?.includes("migrate");

export async function runMigrate(): Promise<void> {
  const result = await migrate();
  console.log(
    `db migrate ok (memory=${result.memory}) applied=[${result.applied.join(", ") || "none"}]`,
  );
}

if (standalone) {
  try {
    await runMigrate();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

export { resetDbForTests, getDb };

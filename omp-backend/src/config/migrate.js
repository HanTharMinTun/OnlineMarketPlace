// =============================================================================
// Minimal SQL migration runner  ->  npm run migrate
// =============================================================================
// Applies every *.sql file in ./migrations exactly once, in filename order, and
// records it in the `schema_migrations` table. Each file is wrapped in its own
// transaction, so a failing migration rolls back completely and the ones that
// already succeeded stay applied.
//
// Existing tables are never dropped or altered by these migrations - they are
// additive only (see migrations/001_auth_hardening.sql).
// =============================================================================
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool, query } from "./db.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(HERE, "migrations");

async function ensureMigrationsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename   TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
}

async function alreadyApplied() {
  const { rows } = await query("SELECT filename FROM schema_migrations");
  return new Set(rows.map((row) => row.filename));
}

async function applyFile(filename) {
  const sql = await fs.readFile(path.join(MIGRATIONS_DIR, filename), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
      filename,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* the original error is more useful */
    }
    throw new Error(`Migration ${filename} failed: ${err.message}`);
  } finally {
    client.release();
  }
}

async function main() {
  await ensureMigrationsTable();
  const done = await alreadyApplied();

  let entries;
  try {
    entries = await fs.readdir(MIGRATIONS_DIR);
  } catch {
    console.log("No migrations directory found - nothing to do.");
    return;
  }

  const files = entries.filter((f) => f.endsWith(".sql")).sort();
  const pending = files.filter((f) => !done.has(f));

  if (pending.length === 0) {
    console.log(`Database is up to date (${files.length} migration(s) applied).`);
    return;
  }

  for (const file of pending) {
    process.stdout.write(`Applying ${file} ... `);
    await applyFile(file);
    console.log("done");
  }
  console.log(`\n${pending.length} migration(s) applied successfully.`);
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("\nMigration failed:", err.message);
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });

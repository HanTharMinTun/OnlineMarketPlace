// Single shared PostgreSQL connection pool for the whole backend.
// Every module must import this pool instead of creating its own connection,
// so that the project keeps exactly one pool (see "no duplicate DB connections").
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

// Configuration comes from environment variables only (.env / .env.example).
// Either DATABASE_URL, or the individual PG* variables, may be used.
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "",
      database: process.env.PGDATABASE || "online_market_place",
    };

// Optional TLS (e.g. managed Postgres providers).
if (process.env.PGSSL === "true") {
  poolConfig.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolConfig);

// Never log the full error object here: it can contain SQL text/parameters.
pool.on("error", (err) => {
  console.error("[db] Unexpected idle client error:", err.message);
});

/**
 * Run a single parameterized query.
 * Always use placeholders ($1, $2, ...) - never string concatenation.
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run several queries inside one transaction.
 * The callback receives a dedicated client that must be used for every query.
 */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failures, the original error is more useful
    }
    throw err;
  } finally {
    client.release();
  }
}

export default pool;

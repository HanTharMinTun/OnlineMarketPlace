// HTTP entry point. Run with: npm run dev  (or: node src/server.js)
import "dotenv/config";
import app from "./app.js";
import { pool } from "./config/db.js";

const port = Number(process.env.PORT || 5000);

const server = app.listen(port, () => {
  console.log(`Server is running smoothly on http://localhost:${port}`);
});

// Graceful shutdown so the shared pool is closed cleanly.
async function shutdown(signal) {
  console.log(`\nReceived ${signal}, shutting down...`);
  server.close(async () => {
    try {
      await pool.end();
    } finally {
      process.exit(0);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

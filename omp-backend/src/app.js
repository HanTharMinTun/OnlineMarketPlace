// Express application wiring (routes + middleware only, no listener).
// The HTTP listener lives in server.js so the app can be imported in tests.
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./auth_and_user/auth.js";
import { csrfGuard, errorHandler } from "./auth_and_user/authMiddleware.js";

const app = express();

// --- Global middleware -------------------------------------------------------
// CORS: allow the Vite dev origin (configurable via CORS_ORIGIN).
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin/tooling requests that send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    // Required so the browser stores/sends the HttpOnly auth cookie when
    // AUTH_COOKIE_MODE is enabled. Harmless otherwise.
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
// Parses the HttpOnly session cookie (AUTH_COOKIE_MODE=true) into req.cookies.
app.use(cookieParser());
// Rejects cross-site cookie-authenticated writes. Bearer-token requests and
// safe methods pass straight through, so existing clients are unaffected.
app.use(csrfGuard);

// --- Routes ------------------------------------------------------------------
app.get("/", (req, res) => {
  res.json({ success: true, message: "Welcome to our online marketplace" });
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "ok" });
});

// Authentication & user management. NOTE: there is deliberately NO public
// admin registration route - admin accounts are managed in PostgreSQL directly.
app.use("/api/auth", authRoutes);

// --- Error handling (last) ---------------------------------------------------
// 404 for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// Central error handler: hides stack traces and SQL errors from clients.
app.use(errorHandler);

export default app;

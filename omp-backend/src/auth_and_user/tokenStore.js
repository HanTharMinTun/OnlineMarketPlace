// =============================================================================
// Token revocation (JWT blacklist) + HttpOnly cookie transport
// =============================================================================
// Two related concerns live here because they both belong to "how a session
// ends":
//
//   1. revoked_tokens - a real server-side logout. Every JWT now carries a
//      unique `jti`; logout inserts that jti and authenticate() rejects it.
//      Tokens are stateless by design, so this is the standard way to make
//      revocation work without a full session store. Rows are pruned once the
//      token would have expired anyway.
//
//   2. HttpOnly cookies - an optional, safer transport for the JWT. When
//      AUTH_COOKIE_MODE is enabled the login endpoints also set an HttpOnly +
//      SameSite cookie, which JavaScript (and therefore XSS) cannot read.
//      The Bearer header keeps working, so existing clients are unaffected.
//
// FAIL-SAFE DESIGN: if the migration has not been run yet, `revoked_tokens`
// does not exist. Instead of crashing every login, the helpers below detect
// that case once and fall back to the previous stateless behaviour, logging a
// clear warning telling the operator to run `npm run migrate`.
// =============================================================================
import "dotenv/config";
import crypto from "node:crypto";

import { query } from "../config/db.js";

export const AUTH_COOKIE_NAME = "omp_token";

/** HttpOnly cookie transport is OFF unless explicitly enabled. */
export function isCookieModeEnabled() {
  return process.env.AUTH_COOKIE_MODE === "true";
}

/**
 * Cookie attributes.
 * - httpOnly: JavaScript cannot read it (blocks token theft via XSS).
 * - sameSite: "lax" works for normal top-level navigation and blocks CSRF for
 *   cross-site POSTs. Use "none" (with secure) only if the UI and API are on
 *   genuinely different sites.
 * - secure: on in production (requires HTTPS). Left off in local dev so the
 *   cookie works over http://localhost.
 */
export function cookieOptions(maxAgeMs) {
  const sameSite = process.env.COOKIE_SAME_SITE || "lax";
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite,
    path: "/",
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

/** Parse "1d" / "12h" / "30m" / "900" (seconds) into milliseconds. */
export function durationToMs(value, fallbackMs = 24 * 60 * 60 * 1000) {
  if (typeof value === "number" && Number.isFinite(value)) return value * 1000;
  if (typeof value !== "string") return fallbackMs;
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(value.trim());
  if (!match) return fallbackMs;
  const amount = Number(match[1]);
  const unit = (match[2] || "s").toLowerCase();
  const factors = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (factors[unit] ?? 1000);
}

// -----------------------------------------------------------------------------
// revoked_tokens helpers
// -----------------------------------------------------------------------------

let tableMissing = false; // remembered after the first failure

/** True when the revoked_tokens table exists (checked lazily, once). */
export async function isRevocationAvailable() {
  if (tableMissing) return false;
  try {
    await query("SELECT 1 FROM revoked_tokens LIMIT 1");
    return true;
  } catch (err) {
    if (err?.code === "42P01") {
      // undefined_table
      tableMissing = true;
      console.warn(
        "[auth] revoked_tokens table is missing - logout cannot revoke tokens " +
          "server-side. Run `npm run migrate` in omp-backend to enable it.",
      );
      return false;
    }
    throw err;
  }
}

/** Add a token's jti to the blacklist. Returns true when it was stored. */
export async function revokeToken({ jti, role, userId, expiresAt }) {
  if (!jti) return false;
  if (!(await isRevocationAvailable())) return false;
  await query(
    `INSERT INTO revoked_tokens (jti, role, user_id, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (jti) DO NOTHING`,
    [jti, role, userId, expiresAt],
  );
  return true;
}

/** True when this jti has been revoked. Never throws on a missing table. */
export async function isTokenRevoked(jti) {
  if (!jti) return false;
  if (!(await isRevocationAvailable())) return false;
  const { rows } = await query("SELECT 1 FROM revoked_tokens WHERE jti = $1", [
    jti,
  ]);
  return rows.length > 0;
}

/**
 * Housekeeping: delete blacklist rows whose token has already expired.
 *
 * Called opportunistically from the logout route (at most once an hour), so the
 * table cannot grow without bound on a long-running server. Cheap because
 * `expires_at` is indexed, and safe to skip: authenticate() only ever looks up
 * rows by `jti`.
 */
export async function pruneRevokedTokens() {
  if (!(await isRevocationAvailable())) return 0;
  const { rowCount } = await query(
    "DELETE FROM revoked_tokens WHERE expires_at < NOW()",
  );
  return rowCount;
}

// -----------------------------------------------------------------------------
// Cookie helpers
// -----------------------------------------------------------------------------

/** Read the JWT from the HttpOnly cookie (falls back to null). */
export function readTokenCookie(req) {
  const raw = req?.headers?.cookie;
  if (typeof raw !== "string" || raw.length === 0) return null;
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (name !== AUTH_COOKIE_NAME) continue;
    const value = part.slice(index + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/** Set the HttpOnly session cookie. */
export function setTokenCookie(res, token, maxAgeMs) {
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions(maxAgeMs));
}

/** Clear the session cookie (same attributes, so browsers match it). */
export function clearTokenCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.COOKIE_SAME_SITE || "lax",
    path: "/",
  });
}

/** Cryptographically strong URL-safe token (used for password resets). */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex digest. Reset tokens are stored hashed, never in the clear. */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export default {
  AUTH_COOKIE_NAME,
  isCookieModeEnabled,
  cookieOptions,
  durationToMs,
  isRevocationAvailable,
  revokeToken,
  isTokenRevoked,
  pruneRevokedTokens,
  readTokenCookie,
  setTokenCookie,
  clearTokenCookie,
  randomToken,
  hashToken,
};



// JWT authentication / authorization middleware.
//
// Security rules enforced here:
//  - The token is read from the "Authorization: Bearer <token>" header, or from
//    the HttpOnly session cookie when AUTH_COOKIE_MODE is enabled. The header
//    always wins, so existing API clients keep working unchanged.
//  - The signature is verified with JWT_SECRET from the environment.
//  - Expiration is validated by jsonwebtoken (exp claim).
//  - The role is taken ONLY from the signed token payload, never from the body,
//    query string or any other client-controlled value.
//  - The token's `jti` is checked against the revoked_tokens blacklist, so a
//    logout really does end the session server-side.
//  - The token's `tv` (token version) is compared with the account's current
//    token_version, so changing/resetting a password invalidates every token
//    issued before that moment.
import "dotenv/config";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { isTokenRevoked, readTokenCookie } from "./tokenStore.js";

export const ROLES = Object.freeze({
  CUSTOMER: "customer",
  SELLER: "seller",
  ADMIN: "admin",
});

const VALID_ROLES = new Set(Object.values(ROLES));
const TABLES = Object.freeze({
  [ROLES.CUSTOMER]: "customer",
  [ROLES.SELLER]: "seller",
  [ROLES.ADMIN]: "admin",
});

/** Read the JWT secret lazily so a missing secret fails loudly, never silently. */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      "JWT_SECRET is not configured. Add it to your .env file (see .env.example).",
    );
  }
  return secret;
}

export function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || "1d";
}

/** Extract a Bearer token from the Authorization header, or null. */
function extractBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== "string") return null;
  const [scheme, token] = header.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Where did this request carry its token?
 * Bearer header first (explicit, works for any client), then the HttpOnly
 * cookie. Returns { token, source } or null.
 */
export function extractToken(req) {
  const bearer = extractBearerToken(req);
  if (bearer) return { token: bearer, source: "bearer" };
  const cookie = readTokenCookie(req);
  if (cookie) return { token: cookie, source: "cookie" };
  return null;
}

/**
 * Verify the JWT and attach { id, role, jti, exp } to req.user.
 * Responds 401 for missing, malformed, expired, revoked or invalid tokens.
 */
export async function authenticate(req, res, next) {
  const found = extractToken(req);
  if (!found) {
    return res.status(401).json({
      success: false,
      message: "Authentication required. Provide a Bearer token.",
    });
  }
  const { token, source } = found;

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret());
  } catch (err) {
    const expired = err?.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      message: expired
        ? "Token has expired. Please log in again."
        : "Invalid authentication token.",
    });
  }

  const role = payload?.role;
  const id = payload?.id ?? payload?.sub;

  if (!VALID_ROLES.has(role) || !Number.isInteger(Number(id))) {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
    });
  }

  // Server-side logout: was this exact token revoked?
  try {
    if (payload.jti && (await isTokenRevoked(payload.jti))) {
      return res.status(401).json({
        success: false,
        message: "This session has been signed out. Please log in again.",
      });
    }
  } catch (err) {
    return next(err);
  }

  // Confirm the account still exists and that the token has not been
  // invalidated by a password change (token_version mismatch).
  const table = TABLES[role];
  let rows;
  try {
    ({ rows } = await query(
      `SELECT id, token_version FROM ${table} WHERE id = $1`,
      [Number(id)],
    ));
  } catch (err) {
    // token_version arrives with the migration; tolerate a pre-migration DB.
    if (err?.code === "42703") {
      ({ rows } = await query(`SELECT id FROM ${table} WHERE id = $1`, [
        Number(id),
      ]));
    } else {
      return next(err);
    }
  }

  if (rows.length === 0) {
    return res.status(401).json({
      success: false,
      message: "Invalid authentication token.",
    });
  }

  const currentVersion = rows[0].token_version;
  if (
    typeof payload.tv === "number" &&
    typeof currentVersion === "number" &&
    payload.tv !== currentVersion
  ) {
    return res.status(401).json({
      success: false,
      message: "Your session is no longer valid. Please log in again.",
    });
  }

  req.user = {
    id: Number(id),
    role,
    jti: payload.jti ?? null,
    exp: payload.exp ?? null,
    tv: typeof payload.tv === "number" ? payload.tv : null,
  };
  req.tokenSource = source;
  return next();
}


/**
 * CSRF guard for cookie-authenticated requests.
 *
 * A JWT sent in the Authorization header cannot be forged by a malicious page
 * (it would have to know the token), so those requests are inherently CSRF-safe.
 * A JWT in a cookie IS sent automatically by the browser, so cookie-based
 * authentication needs explicit CSRF protection. Two layers are used:
 *
 *   1. The cookie itself is SameSite=Lax, so a browser will not attach it to a
 *      cross-site POST/PUT/DELETE in the first place.
 *   2. This middleware additionally requires a custom `X-Requested-With` header
 *      on any state-changing request that relies on the cookie. A cross-site
 *      HTML form cannot set a custom header, and a cross-site XHR/fetch that
 *      tries to would first have to pass a CORS preflight - which this API only
 *      answers for the origins listed in CORS_ORIGIN.
 *
 * Safe methods (GET/HEAD/OPTIONS) and Authorization-header requests pass
 * straight through, and the expected header is configurable so nobody has to
 * change the frontend to use it.
 */
export function csrfGuard(req, res, next) {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return next();
  }

  // Explicit Bearer auth: the browser will not add it by itself -> CSRF-safe.
  if (extractBearerToken(req)) return next();

  // No cookie either -> nothing to protect (the route will answer 401).
  if (!readTokenCookie(req)) return next();

  const headerName = (
    process.env.AUTH_CSRF_HEADER || "x-requested-with"
  ).toLowerCase();
  const expected = process.env.AUTH_CSRF_VALUE || "XMLHttpRequest";

  if (req.headers?.[headerName] === expected) return next();

  return res.status(403).json({
    success: false,
    message:
      "This request was blocked to protect your account from cross-site " +
      `request forgery. Send the ${headerName}: ${expected} header with ` +
      "cookie-authenticated requests.",
  });
}

/** Role-based access control. Usage: requireRole(ROLES.SELLER) */
export function requireRole(...allowedRoles) {
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to perform this action.",
      });
    }
    return next();
  };
}

/**
 * Block suspended sellers from protected seller operations.
 * Must be used after authenticate().
 */
export async function requireActiveSeller(req, res, next) {
  if (req.user?.role !== ROLES.SELLER) return next();
  const { rows } = await query("SELECT status FROM seller WHERE id = $1", [
    req.user.id,
  ]);
  const status = rows[0]?.status;
  if (status === "suspended") {
    return res.status(403).json({
      success: false,
      message: "Your seller account is suspended. Contact support.",
    });
  }
  req.sellerStatus = status;
  return next();
}

/** Shared error handler so stack traces / SQL errors never reach clients. */
export function errorHandler(err, req, res, _next) {
  console.error("[api] Unhandled error:", err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
}

export default {
  authenticate,
  extractToken,
  csrfGuard,
  requireRole,
  requireActiveSeller,
  errorHandler,
};

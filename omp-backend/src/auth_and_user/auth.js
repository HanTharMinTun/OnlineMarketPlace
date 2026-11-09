// =============================================================================
// Authentication & User Management API  ->  mounted at /api/auth
// =============================================================================
// Users: customer, seller (self-service) and admin.
//
// ADMIN POLICY (do not change):
//   * Admin accounts are created and managed directly in PostgreSQL by the
//     developer. There is intentionally NO public admin registration endpoint.
//   * No endpoint accepts `role`, `id`, `password_hash` or `status` from the
//     client. Role always comes from the signed JWT payload.
//   * Existing admin rows / tables are never modified by this module.
//
// Module system: ES Modules (package.json has "type": "module").
// Database: the single shared pool from ../config/db.js (no extra connections).
// =============================================================================

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";

import { query } from "../config/db.js";
import {
  ROLES,
  authenticate,
  requireRole,
  requireActiveSeller,
  getJwtSecret,
  getJwtExpiresIn,
} from "./authMiddleware.js";
import {
  clearTokenCookie,
  durationToMs,
  hashToken,
  isCookieModeEnabled,
  isRevocationAvailable,
  pruneRevokedTokens,
  randomToken,
  revokeToken,
  setTokenCookie,
} from "./tokenStore.js";
import {
  buildPasswordResetEmail,
  isDevelopment,
  isMailerConfigured,
  sendMail,
} from "./mailer.js";

const router = express.Router();

// -----------------------------------------------------------------------------
// Constants & helpers
// -----------------------------------------------------------------------------

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// At least 8 chars, one letter and one number.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const PHONE_REGEX = /^[0-9+\-\s()]{6,20}$/;

const PUBLIC_CUSTOMER_FIELDS = "id, name, email, phone, created_at";
const PUBLIC_SELLER_FIELDS =
  "id, name, email, phone, shop_name, address, status, created_at";
// Admin accounts are developer-managed: only these columns are ever read/sent.
const PUBLIC_ADMIN_FIELDS = "id, name, email, phone, created_at";

// Password reset tuning (all overridable from .env).
const RESET_TOKEN_TTL_MINUTES = Number(
  process.env.PASSWORD_RESET_TTL_MINUTES || 30,
);
// Reject absurdly short/long tokens before touching the database.
const RESET_TOKEN_MIN_LENGTH = 32;
const RESET_TOKEN_MAX_LENGTH = 200;

// Timestamp of the last revoked_tokens cleanup (see the logout route).
let lastPruneAt = 0;


function ok(res, status, message, extra = {}) {
  return res.status(status).json({ success: true, message, ...extra });
}

function fail(res, status, message, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

/** Trim + lowercase e-mail. */
function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Trim a string, or return "" for non-strings. */
function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isNonEmptyString(value, max) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max
  );
}

/** PostgreSQL unique-constraint violation. */
function isUniqueViolation(err) {
  return err && err.code === "23505";
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Sign a JWT. The role is embedded here and is the only trusted source.
 * `jti` gives the token a unique identity so logout can blacklist exactly this
 * token, and `tv` records the account's token_version so a password change can
 * invalidate every previously issued token at once.
 */
function signToken(user, role) {
  const payload = {
    id: Number(user.id),
    role,
    ...(user.token_version !== undefined
      ? { tv: Number(user.token_version) }
      : {}),
  };
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
    jwtid: crypto.randomUUID(),
  });
}

/**
 * Issue a session: sign the token, optionally set the HttpOnly cookie, and
 * return the body fields the frontend expects.
 *
 * The token is ALWAYS returned in the JSON body so the existing Bearer-based
 * frontend keeps working; `AUTH_COOKIE_MODE=true` additionally sets an HttpOnly
 * cookie so a browser client can stop touching web storage entirely.
 */
function issueSession(res, user, role, message, extra = {}) {
  const token = signToken(user, role);
  const cookieMode = isCookieModeEnabled();
  if (cookieMode) {
    setTokenCookie(res, token, durationToMs(getJwtExpiresIn()));
  }
  return ok(res, 200, message, {
    token,
    user: publicUser(user, role),
    // Tells the client which transport to use; purely informational.
    tokenTransport: cookieMode ? "cookie" : "body",
    ...extra,
  });
}

/**
 * Store a new password hash AND invalidate every token issued before now, in a
 * single atomic statement.
 *
 * Incrementing `token_version` is what makes this real: authenticate() compares
 * the `tv` claim of the incoming JWT against this column, so old tokens stop
 * working the moment the password changes (essential after a password reset
 * triggered by a possible account compromise).
 *
 * Returns the updated public row, or the row without `token_version` when the
 * hardening migration has not been applied yet.
 */
async function setPasswordAndInvalidateSessions(
  table,
  id,
  newHash,
  publicFields,
) {
  try {
    const { rows } = await query(
      `UPDATE ${table}
          SET password_hash = $1, token_version = token_version + 1
        WHERE id = $2
        RETURNING ${publicFields}, token_version`,
      [newHash, id],
    );
    return rows[0] || null;
  } catch (err) {
    if (err?.code !== "42703") throw err; // undefined_column
    const { rows } = await query(
      `UPDATE ${table} SET password_hash = $1 WHERE id = $2
        RETURNING ${publicFields}`,
      [newHash, id],
    );
    return rows[0] || null;
  }
}


/** Build the safe public shape returned by register/login/me. */
function publicUser(row, role) {
  const base = {
    id: Number(row.id),
    name: row.name,
    email: row.email,
    role,
  };
  if (row.phone !== undefined) base.phone = row.phone;
  if (row.created_at !== undefined) base.created_at = row.created_at;
  if (role === ROLES.SELLER) {
    base.shop_name = row.shop_name ?? null;
    base.address = row.address ?? null;
    base.status = row.status ?? null;
  }
  return base;
}

/**
 * Load an account row for login: the public fields, the password hash and (once
 * the hardening migration has run) token_version.
 *
 * The column list is a fixed allow-list; nothing client-supplied reaches the
 * SQL. The token_version lookup falls back gracefully on a pre-migration
 * database so the module keeps working before `npm run migrate` is run.
 */
async function findAccountByEmail(table, publicFields, email) {
  try {
    const { rows } = await query(
      `SELECT ${publicFields}, password_hash, token_version
         FROM ${table} WHERE email = $1`,
      [email],
    );
    return rows[0] || null;
  } catch (err) {
    if (err?.code !== "42703") throw err; // undefined_column
    const { rows } = await query(
      `SELECT ${publicFields}, password_hash FROM ${table} WHERE email = $1`,
      [email],
    );
    return rows[0] || null;
  }
}

// -----------------------------------------------------------------------------
// Password recovery helpers
// -----------------------------------------------------------------------------

// Where the reset link points. The frontend route is /reset-password.
const RESET_URL_BASE = (
  process.env.PASSWORD_RESET_URL ||
  process.env.APP_BASE_URL ||
  "http://localhost:5173/reset-password"
).replace(/\/+$/, "");

/** Build the link that goes into the email. Token is URL-encoded. */
function buildResetUrl(token) {
  const separator = RESET_URL_BASE.includes("?") ? "&" : "?";
  return `${RESET_URL_BASE}${separator}token=${encodeURIComponent(token)}`;
}

/**
 * The three tables an account can live in. Used by password recovery, which -
 * unlike login - has no role in the request to tell it where to look.
 */
const ACCOUNT_TABLES = [
  { role: ROLES.CUSTOMER, table: "customer", fields: PUBLIC_CUSTOMER_FIELDS },
  { role: ROLES.SELLER, table: "seller", fields: PUBLIC_SELLER_FIELDS },
  { role: ROLES.ADMIN, table: "admin", fields: PUBLIC_ADMIN_FIELDS },
];

/** Map a role to its table/field metadata (null for an unknown role). */
function accountMetaForRole(role) {
  return ACCOUNT_TABLES.find((entry) => entry.role === role) || null;
}

let resetTableMissing = false;

/** True when password_reset_tokens exists (checked lazily, once). */
async function isResetTableAvailable() {
  if (resetTableMissing) return false;
  try {
    await query("SELECT 1 FROM password_reset_tokens LIMIT 1");
    return true;
  } catch (err) {
    if (err?.code === "42P01") {
      resetTableMissing = true;
      console.warn(
        "[auth] password_reset_tokens table is missing - password recovery is " +
          "disabled. Run `npm run migrate` in omp-backend to enable it.",
      );
      return false;
    }
    throw err;
  }
}

/**
 * Very small in-memory rate limiter for the recovery endpoints.
 *
 * It is deliberately dependency-free and per-process: it stops casual abuse of
 * the reset endpoint (which sends email) without adding Redis to the project.
 * Behind multiple server instances each process keeps its own counter, so this
 * is a speed bump, not a hard guarantee - a shared store would be the next step.
 */
const throttleBuckets = new Map();

function throttle(key, { limit, windowMs }) {
  const now = Date.now();
  const bucket = throttleBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    throttleBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Drop expired buckets so the map cannot grow forever. */
function pruneThrottleBuckets() {
  const now = Date.now();
  for (const [key, bucket] of throttleBuckets) {
    if (now > bucket.resetAt) throttleBuckets.delete(key);
  }
}

function clientIp(req) {
  return (
    req.ip ||
    req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

// -----------------------------------------------------------------------------
// Validation helpers (return an error message string, or null when valid)
// -----------------------------------------------------------------------------

function validateCredentials(email, password) {
  if (!isNonEmptyString(email, 255)) return "A valid email is required.";
  if (!EMAIL_REGEX.test(email)) return "Email format is invalid.";
  if (typeof password !== "string" || password.length === 0)
    return "Password is required.";
  if (!PASSWORD_REGEX.test(password))
    return "Password must be at least 8 characters and contain both letters and numbers.";
  return null;
}

function validatePhone(phone, { required = false } = {}) {
  if (phone === undefined || phone === null || phone === "") {
    return required ? "Phone number is required." : null;
  }
  if (typeof phone !== "string" || !PHONE_REGEX.test(phone.trim()))
    return "Phone number format is invalid.";
  return null;
}

// =============================================================================
// A. POST /api/auth/customer/register
// =============================================================================
router.post("/customer/register", async (req, res, next) => {
  try {
    // Mass-assignment protection: only these keys are ever read.
    const name = clean(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const phone = clean(req.body?.phone);

    if (!isNonEmptyString(name, 100))
      return fail(res, 400, "Name is required (max 100 characters).");

    const credentialError = validateCredentials(email, password);
    if (credentialError) return fail(res, 400, credentialError);

    const phoneError = validatePhone(phone);
    if (phoneError) return fail(res, 400, phoneError);

    const passwordHash = await hashPassword(password);

    const { rows } = await query(
      `INSERT INTO customer (name, email, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PUBLIC_CUSTOMER_FIELDS}`,
      [name, email, passwordHash, phone || null],
    );

    return ok(res, 201, "Registration successful", {
      user: publicUser(rows[0], ROLES.CUSTOMER),
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(res, 409, "An account with this email already exists.");
    }
    return next(err);
  }
});

// =============================================================================
// B. POST /api/auth/seller/register
// =============================================================================
router.post("/seller/register", async (req, res, next) => {
  try {
    const name = clean(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const phone = clean(req.body?.phone);
    const shopName = clean(req.body?.shop_name);
    const address = clean(req.body?.address);
    const idCard = clean(req.body?.id_card);
    const kpayPhone = clean(req.body?.kpay_phone);
    const bankAcc = clean(req.body?.bank_acc);

    if (!isNonEmptyString(name, 100))
      return fail(res, 400, "Name is required (max 100 characters).");

    const credentialError = validateCredentials(email, password);
    if (credentialError) return fail(res, 400, credentialError);

    const phoneError = validatePhone(phone, { required: true });
    if (phoneError) return fail(res, 400, phoneError);

    // Column limits from database.sql
    if (shopName && shopName.length > 20)
      return fail(res, 400, "Shop name must be 20 characters or fewer.");
    if (address && address.length > 50)
      return fail(res, 400, "Address must be 50 characters or fewer.");
    if (idCard && idCard.length > 50)
      return fail(res, 400, "ID card must be 50 characters or fewer.");
    if (kpayPhone) {
      const kpayError = validatePhone(kpayPhone);
      if (kpayError) return fail(res, 400, "KBZ Pay phone format is invalid.");
    }
    if (bankAcc && bankAcc.length > 50)
      return fail(res, 400, "Bank account must be 50 characters or fewer.");

    const passwordHash = await hashPassword(password);

    // `status` is intentionally NOT part of the INSERT: the table default
    // ('pending') applies and the client can never self-approve.
    const { rows } = await query(
      `INSERT INTO seller
         (name, email, password_hash, phone, shop_name, address, id_card, kpay_phone, bank_acc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${PUBLIC_SELLER_FIELDS}`,
      [
        name,
        email,
        passwordHash,
        phone,
        shopName || null,
        address || null,
        idCard || null,
        kpayPhone || null,
        bankAcc || null,
      ],
    );

    return ok(
      res,
      201,
      "Registration successful. Your shop is pending admin approval.",
      { user: publicUser(rows[0], ROLES.SELLER) },
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(res, 409, "An account with this email already exists.");
    }
    return next(err);
  }
});

// =============================================================================
// C. POST /api/auth/customer/login
// =============================================================================
router.post("/customer/login", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || typeof password !== "string" || password.length === 0) {
      return fail(res, 400, "Email and password are required.");
    }

    const user = await findAccountByEmail(
      "customer",
      PUBLIC_CUSTOMER_FIELDS,
      email,
    );

    // Generic message: never reveal whether the email or the password was wrong.
    const valid = user
      ? await verifyPassword(password, user.password_hash)
      : false;
    if (!valid) return fail(res, 401, "Invalid email or password.");

    return issueSession(res, user, ROLES.CUSTOMER, "Login successful");
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// D. POST /api/auth/seller/login
// =============================================================================
router.post("/seller/login", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || typeof password !== "string" || password.length === 0) {
      return fail(res, 400, "Email and password are required.");
    }

    const seller = await findAccountByEmail(
      "seller",
      PUBLIC_SELLER_FIELDS,
      email,
    );

    const valid = seller
      ? await verifyPassword(password, seller.password_hash)
      : false;
    if (!valid) return fail(res, 401, "Invalid email or password.");

    // Suspended sellers are rejected from all seller operations.
    if (seller.status === "suspended") {
      return fail(
        res,
        403,
        "Your seller account is suspended. Contact support.",
      );
    }

    const pending = seller.status === "pending";

    return issueSession(
      res,
      seller,
      ROLES.SELLER,
      pending
        ? "Login successful. Your shop is pending admin approval."
        : "Login successful",
      pending ? { requiresApproval: true } : {},
    );
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// E. POST /api/auth/admin/login
// =============================================================================
// Admin accounts are provisioned directly in PostgreSQL by the developer. This
// endpoint only lets an EXISTING admin row sign in - there is deliberately no
// admin registration/creation route anywhere in the API.
//
// Identical hardening to the customer/seller logins:
//   * the same generic error for a wrong email and a wrong password
//     (no account enumeration),
//   * the role in the token comes from the admin table lookup, never the input,
//   * no request body field other than email/password is read.
router.post("/admin/login", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    console.log(email)
    console.log(password)

    if (!email || typeof password !== "string" || password.length === 0) {
      return fail(res, 400, "Email and password are required.");
    }

    const admin = await findAccountByEmail("admin", PUBLIC_ADMIN_FIELDS, email);

    // console.log(admin)
    // console.log(password)
    // console.log(admin.password_hash)

    // let new_hashed_password = await hashPassword(password)
    // console.log(new_hashed_password)

    const valid = admin
      ? await verifyPassword(password, admin.password_hash)
      : false;
    if (!valid) return fail(res, 401, "Invalid email or password.");

    return issueSession(res, admin, ROLES.ADMIN, "Login successful");
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// F. GET /api/auth/me   (customer | seller | admin)
// =============================================================================
router.get("/me", authenticate, async (req, res, next) => {
  try {
    const { id, role } = req.user;

    if (role === ROLES.CUSTOMER) {
      const { rows } = await query(
        `SELECT ${PUBLIC_CUSTOMER_FIELDS} FROM customer WHERE id = $1`,
        [id],
      );
      if (!rows[0]) return fail(res, 404, "User not found.");
      return ok(res, 200, "Profile fetched successfully", {
        user: publicUser(rows[0], ROLES.CUSTOMER),
      });
    }

    if (role === ROLES.SELLER) {
      const { rows } = await query(
        `SELECT ${PUBLIC_SELLER_FIELDS} FROM seller WHERE id = $1`,
        [id],
      );
      if (!rows[0]) return fail(res, 404, "User not found.");
      return ok(res, 200, "Profile fetched successfully", {
        user: publicUser(rows[0], ROLES.SELLER),
      });
    }

    // Admin: read-only, minimal projection. Admin accounts stay developer-managed.
    const { rows } = await query(
      "SELECT id, name, email, phone, created_at FROM admin WHERE id = $1",
      [id],
    );
    if (!rows[0]) return fail(res, 404, "User not found.");
    return ok(res, 200, "Profile fetched successfully", {
      user: {
        id: Number(rows[0].id),
        name: rows[0].name,
        email: rows[0].email,
        phone: rows[0].phone,
        role: ROLES.ADMIN,
        created_at: rows[0].created_at,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// G. PUT /api/auth/customer/profile   (customer only)
// =============================================================================
router.put(
  "/customer/profile",
  authenticate,
  requireRole(ROLES.CUSTOMER),
  async (req, res, next) => {
    try {
      const name = req.body?.name;
      const phone = req.body?.phone;

      if (name === undefined && phone === undefined) {
        return fail(
          res,
          400,
          "Provide at least one field to update (name, phone).",
        );
      }

      const updates = [];
      const values = [];

      if (name !== undefined) {
        if (!isNonEmptyString(name, 100))
          return fail(res, 400, "Name must be 1-100 characters.");
        values.push(name.trim());
        updates.push(`name = $${values.length}`);
      }

      if (phone !== undefined) {
        const phoneError = validatePhone(phone);
        if (phoneError) return fail(res, 400, phoneError);
        values.push(clean(phone) || null);
        updates.push(`phone = $${values.length}`);
      }

      // id / email / password_hash / role are deliberately not updatable here.
      values.push(req.user.id);
      const { rows } = await query(
        `UPDATE customer SET ${updates.join(", ")}
          WHERE id = $${values.length}
          RETURNING ${PUBLIC_CUSTOMER_FIELDS}`,
        values,
      );

      if (!rows[0]) return fail(res, 404, "User not found.");
      return ok(res, 200, "Profile updated successfully", {
        user: publicUser(rows[0], ROLES.CUSTOMER),
      });
    } catch (err) {
      return next(err);
    }
  },
);

// =============================================================================
// H. PUT /api/auth/seller/profile   (seller only)
// =============================================================================
router.put(
  "/seller/profile",
  authenticate,
  requireRole(ROLES.SELLER),
  requireActiveSeller,
  async (req, res, next) => {
    try {
      // Only these fields may be changed by the seller themselves.
      const allowed = {
        name: (v) =>
          isNonEmptyString(v, 100) ? null : "Name must be 1-100 characters.",
        phone: (v) => validatePhone(v),
        shop_name: (v) =>
          clean(v).length <= 20
            ? null
            : "Shop name must be 20 characters or fewer.",
        address: (v) =>
          clean(v).length <= 50
            ? null
            : "Address must be 50 characters or fewer.",
      };

      const updates = [];
      const values = [];

      for (const [field, validate] of Object.entries(allowed)) {
        if (req.body?.[field] === undefined) continue;
        const error = validate(req.body[field]);
        if (error) return fail(res, 400, error);
        values.push(clean(req.body[field]) || null);
        updates.push(`${field} = $${values.length}`);
      }

      if (updates.length === 0) {
        return fail(
          res,
          400,
          "Provide at least one field to update (name, phone, shop_name, address).",
        );
      }

      // status / id / email / password_hash / kpay_phone / bank_acc are NOT updatable.
      values.push(req.user.id);
      const { rows } = await query(
        `UPDATE seller SET ${updates.join(", ")}
          WHERE id = $${values.length}
          RETURNING ${PUBLIC_SELLER_FIELDS}`,
        values,
      );

      if (!rows[0]) return fail(res, 404, "Seller not found.");
      return ok(res, 200, "Profile updated successfully", {
        user: publicUser(rows[0], ROLES.SELLER),
      });
    } catch (err) {
      return next(err);
    }
  },
);

// =============================================================================
// I. PUT /api/auth/change-password   (customer | seller)
// =============================================================================
router.put(
  "/change-password",
  authenticate,
  requireRole(ROLES.CUSTOMER, ROLES.SELLER),
  async (req, res, next) => {
    try {
      const currentPassword = req.body?.currentPassword;
      const newPassword = req.body?.newPassword;

      if (typeof currentPassword !== "string" || currentPassword.length === 0)
        return fail(res, 400, "Current password is required.");
      if (typeof newPassword !== "string" || newPassword.length === 0)
        return fail(res, 400, "New password is required.");
      if (!PASSWORD_REGEX.test(newPassword))
        return fail(
          res,
          400,
          "New password must be at least 8 characters and contain both letters and numbers.",
        );
      if (currentPassword === newPassword)
        return fail(
          res,
          400,
          "New password must be different from the current password.",
        );

      // Table name comes from the signed token role only - never from input.
      const table = req.user.role === ROLES.SELLER ? "seller" : "customer";
      const publicFields =
        req.user.role === ROLES.SELLER
          ? PUBLIC_SELLER_FIELDS
          : PUBLIC_CUSTOMER_FIELDS;

      const { rows } = await query(
        `SELECT password_hash FROM ${table} WHERE id = $1`,
        [req.user.id],
      );
      const user = rows[0];
      if (!user) return fail(res, 404, "User not found.");

      const valid = await verifyPassword(currentPassword, user.password_hash);
      if (!valid) return fail(res, 401, "Current password is incorrect.");

      const newHash = await hashPassword(newPassword);

      // Saves the hash and bumps token_version in one statement, so every
      // session that existed before this moment is invalidated (all devices).
      const updated = await setPasswordAndInvalidateSessions(
        table,
        req.user.id,
        newHash,
        publicFields,
      );

      // This device stays signed in: issue a fresh token carrying the new
      // token_version, and re-set the HttpOnly cookie when cookie mode is on.
      // The previous token is dead the instant the UPDATE above commits.
      const freshUser = updated ?? {
        ...user,
        id: req.user.id,
        role: req.user.role,
      };
      const token = signToken(freshUser, req.user.role);
      if (isCookieModeEnabled()) {
        setTokenCookie(res, token, durationToMs(getJwtExpiresIn()));
      }

      return ok(res, 200, "Password changed successfully", {
        // The current session's new token. Swapping it in keeps this device
        // logged in; every other device has to sign in again.
        token,
        user: publicUser({ ...freshUser, id: req.user.id }, req.user.role),
        otherSessionsInvalidated: true,
      });
    } catch (err) {
      return next(err);
    }
  },
);

// =============================================================================
// J. POST /api/auth/logout
// =============================================================================
// This used to be a no-op that only told the client to throw its token away.
// It is now a REAL server-side logout:
//
//   * the token's unique `jti` is written to the revoked_tokens blacklist, so
//     authenticate() rejects that exact token from now on - even if an attacker
//     copied it before the user pressed "Sign out", and
//   * the HttpOnly session cookie is cleared.
//
// Tokens are still stateless JWTs (no session table), so this is a blacklist
// rather than full session management:
//   * `jti` was only added to tokens issued after this change, so a token minted
//     by an older build cannot be revoked (it just expires normally);
//   * rows are kept only until the token's own `exp`, then pruned;
//   * only the calling token is revoked. Other devices stay signed in - use
//     change-password/reset-password to invalidate every session at once.
router.post("/logout", authenticate, async (req, res, next) => {
  try {
    const { jti, role, id, exp } = req.user;

    let revoked = false;
    if (jti) {
      revoked = await revokeToken({
        jti,
        role,
        userId: id,
        expiresAt: exp ? new Date(exp * 1000) : new Date(Date.now() + 86_400_000),
      });
    }
    const blacklistReady = await isRevocationAvailable();

    // Housekeeping: drop rows for tokens that have expired anyway. Throttled to
    // once an hour so a busy logout endpoint never pays for it repeatedly.
    const now = Date.now();
    if (blacklistReady && now - lastPruneAt > 60 * 60 * 1000) {
      lastPruneAt = now;
      await pruneRevokedTokens();
    }

    clearTokenCookie(res);

    return ok(res, 200, "Logged out successfully.", {
      tokenInvalidated: revoked,
      cookieCleared: true,
      note: revoked
        ? "This token has been revoked server-side and can no longer be used."
        : blacklistReady
          ? "The token identity was missing (issued by an older build); it remains valid until it expires. Discard it on the client."
          : "Server-side revocation is not enabled: run `npm run migrate` in omp-backend. Discard the token on the client.",
    });
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// K. POST /api/auth/forgot-password
// =============================================================================
// Body: { email }
//
// Security properties (all deliberate):
//   * The SAME response is returned whether or not the email exists, so this
//     endpoint cannot be used to discover which addresses have accounts.
//   * Only the SHA-256 hash of the reset token is stored, so a database leak
//     does not hand out working reset links.
//   * Any previous unused token for that account is invalidated first, so only
//     the newest link works.
//   * The token is single-use and expires (PASSWORD_RESET_TTL_MINUTES, default
//     30 minutes).
//   * Rate limited per IP and per email address.
//   * The account is searched across customer, seller and admin - the requester
//     does not say (and cannot choose) which table to look in.
router.post("/forgot-password", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!email || !EMAIL_REGEX.test(email)) {
      return fail(res, 400, "A valid email address is required.");
    }

    // Generic message reused for every outcome below.
    const genericMessage =
      "If an account exists for that email address, a password reset link has been sent.";

    // --- rate limiting ------------------------------------------------------
    pruneThrottleBuckets();
    const ipCheck = throttle(`forgot:ip:${clientIp(req)}`, {
      limit: Number(process.env.PASSWORD_RESET_IP_LIMIT || 10),
      windowMs: 15 * 60 * 1000,
    });
    if (!ipCheck.allowed) {
      res.set("Retry-After", String(ipCheck.retryAfterSeconds));
      return fail(
        res,
        429,
        "Too many password reset requests. Please try again later.",
      );
    }
    const emailCheck = throttle(`forgot:email:${email}`, {
      limit: Number(process.env.PASSWORD_RESET_EMAIL_LIMIT || 3),
      windowMs: 15 * 60 * 1000,
    });
    if (!emailCheck.allowed) {
      res.set("Retry-After", String(emailCheck.retryAfterSeconds));
      return fail(
        res,
        429,
        "Too many password reset requests for this address. Please try again later.",
      );
    }

    // --- feature availability ----------------------------------------------
    // Without the table we genuinely cannot do this: 503 says so honestly.
    if (!(await isResetTableAvailable())) {
      return fail(
        res,
        503,
        "Password recovery is not enabled on this server yet.",
        { code: "RECOVERY_UNAVAILABLE" },
      );
    }

    // Without a mail transport the link cannot reach the user. In production
    // that is a hard failure - we must never claim an email was sent. In
    // development we still create the token and log the link to the server
    // console, and the response reports emailSent:false so nothing is faked.
    const mailConfigured = isMailerConfigured();
    if (!mailConfigured && !isDevelopment()) {
      return fail(
        res,
        503,
        "Password recovery is not available: no mail transport (SMTP_HOST) is configured on this server.",
        { code: "MAIL_NOT_CONFIGURED" },
      );
    }

    // --- find the account (customer, seller or admin) -----------------------
    let account = null;
    for (const meta of ACCOUNT_TABLES) {
      const { rows } = await query(
        `SELECT id, name, email FROM ${meta.table} WHERE email = $1`,
        [email],
      );
      if (rows[0]) {
        account = { ...meta, row: rows[0] };
        break;
      }
    }

    if (!account) {
      // Unknown address: identical response, no email, nothing stored.
      return ok(res, 200, genericMessage, { emailSent: false });
    }

    // --- issue a fresh single-use token -------------------------------------
    const rawToken = randomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000,
    );

    // Invalidate any outstanding token for this account, then store the new one.
    await query(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE role = $1 AND user_id = $2 AND used_at IS NULL`,
      [account.role, account.row.id],
    );
    await query(
      `INSERT INTO password_reset_tokens (user_id, role, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [account.row.id, account.role, tokenHash, expiresAt],
    );

    // --- deliver ------------------------------------------------------------
    const resetUrl = buildResetUrl(rawToken);
    const { text, html } = buildPasswordResetEmail({
      name: account.row.name,
      resetUrl,
      expiresMinutes: RESET_TOKEN_TTL_MINUTES,
    });

    const delivery = await sendMail({
      to: account.row.email,
      subject: "Reset your Online Marketplace password",
      text,
      html,
    });

    return ok(res, 200, genericMessage, {
      emailSent: delivery.delivered,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
      // Local-development convenience ONLY, and it must be switched on
      // explicitly: never enabled in production, and never on by default, so a
      // misconfigured NODE_ENV cannot leak working reset links.
      ...(isDevelopment() && process.env.AUTH_EXPOSE_RESET_TOKEN === "true"
        ? { devResetUrl: resetUrl }
        : {}),
    });
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// L. POST /api/auth/reset-password
// =============================================================================
// Body: { token, newPassword }
//
// The token is looked up by its SHA-256 hash, must be unused and unexpired, and
// is consumed in the same request. On success every existing session for that
// account is invalidated (token_version bump).
router.post("/reset-password", async (req, res, next) => {
  try {
    const token =
      typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const newPassword = req.body?.newPassword;

    if (!token) return fail(res, 400, "A reset token is required.");
    if (
      token.length < RESET_TOKEN_MIN_LENGTH ||
      token.length > RESET_TOKEN_MAX_LENGTH
    ) {
      return fail(res, 400, "This password reset link is invalid.");
    }
    if (typeof newPassword !== "string" || newPassword.length === 0)
      return fail(res, 400, "A new password is required.");
    if (!PASSWORD_REGEX.test(newPassword))
      return fail(
        res,
        400,
        "Password must be at least 8 characters and contain both letters and numbers.",
      );

    if (!(await isResetTableAvailable())) {
      return fail(
        res,
        503,
        "Password recovery is not enabled on this server yet.",
        { code: "RECOVERY_UNAVAILABLE" },
      );
    }

    pruneThrottleBuckets();
    const attemptCheck = throttle(`reset:ip:${clientIp(req)}`, {
      limit: Number(process.env.PASSWORD_RESET_ATTEMPT_LIMIT || 20),
      windowMs: 15 * 60 * 1000,
    });
    if (!attemptCheck.allowed) {
      res.set("Retry-After", String(attemptCheck.retryAfterSeconds));
      return fail(res, 429, "Too many attempts. Please try again later.");
    }

    // Look the token up by hash: the raw value is never stored.
    const { rows } = await query(
      `SELECT id, user_id, role, expires_at, used_at
         FROM password_reset_tokens
        WHERE token_hash = $1`,
      [hashToken(token)],
    );
    const record = rows[0];

    // One generic message for every failure mode: unknown, already used or
    // expired. Telling them apart would leak information about the token.
    const invalidLink =
      "This password reset link is invalid or has expired. Please request a new one.";

    if (!record) return fail(res, 400, invalidLink);
    if (record.used_at) return fail(res, 400, invalidLink);
    if (new Date(record.expires_at).getTime() <= Date.now()) {
      return fail(res, 400, invalidLink);
    }

    const meta = accountMetaForRole(record.role);
    if (!meta) return fail(res, 400, invalidLink);

    // The account may have been deleted after the link was issued.
    const { rows: userRows } = await query(
      `SELECT id FROM ${meta.table} WHERE id = $1`,
      [record.user_id],
    );
    if (!userRows[0]) return fail(res, 400, invalidLink);

    const newHash = await hashPassword(newPassword);

    // Consume the token FIRST (single use), then set the password. If the
    // second step failed the link would still be burned, which is the safer
    // failure: the user simply requests a new link.
    const consumed = await query(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE id = $1 AND used_at IS NULL
        RETURNING id`,
      [record.id],
    );
    if (!consumed.rows[0]) return fail(res, 400, invalidLink);

    await setPasswordAndInvalidateSessions(
      meta.table,
      record.user_id,
      newHash,
      meta.fields,
    );

    // Any other outstanding link for this account is now useless too.
    await query(
      `UPDATE password_reset_tokens
          SET used_at = NOW()
        WHERE role = $1 AND user_id = $2 AND used_at IS NULL`,
      [record.role, record.user_id],
    );

    return ok(
      res,
      200,
      "Password reset successfully. Please sign in with your new password.",
      { allSessionsInvalidated: true },
    );
  } catch (err) {
    return next(err);
  }
});

export default router;


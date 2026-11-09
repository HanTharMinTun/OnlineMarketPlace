// =============================================================================
// Integration tests for the authentication module
// =============================================================================
// Run with:  npm test          (from omp-backend/)
//
// These tests talk to the REAL Express app and the REAL PostgreSQL database
// configured in .env - that is the only way to prove JWT revocation, token
// versions and the reset-token lifecycle actually work.
//
// Every row they create is namespaced with a unique run id and deleted again in
// the `after` hook, so the development data is left exactly as it was found.
// If the database is unreachable the whole suite is skipped rather than failed.
// =============================================================================
import test, { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import app from "../src/app.js";
import { pool, query } from "../src/config/db.js";

const RUN = Date.now().toString(36);

// Low bcrypt cost: these are throwaway test accounts, not real credentials.
const TEST_ROUNDS = 4;

const CUSTOMER = {
  name: "Test Customer",
  email: `test.customer.${RUN}@example.test`,
  password: "CustomerPass123",
};
const SELLER = {
  name: "Test Seller",
  email: `test.seller.${RUN}@example.test`,
  password: "SellerPass123",
};
const ADMIN = {
  name: "Test Admin",
  email: `test.admin.${RUN}@example.test`,
  password: "AdminPass123",
};

let server;
let baseUrl;
let dbAvailable = false;

const ids = { customer: null, seller: null, admin: null };

/** Small fetch wrapper that never throws on a non-2xx status. */
async function api(path, { method = "GET", body, token, cookie, headers = {} } = {}) {
  const finalHeaders = { Accept: "application/json", ...headers };
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
  if (token) finalHeaders.Authorization = `Bearer ${token}`;
  if (cookie) finalHeaders.Cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data, response };
}

/** Insert a throwaway account and return its id. */
async function createAccount(table, { name, email, password }, extra = {}) {
  const hash = await bcrypt.hash(password, TEST_ROUNDS);
  const columns = ["name", "email", "password_hash"];
  const values = [name, email, hash];
  for (const [column, value] of Object.entries(extra)) {
    columns.push(column);
    values.push(value);
  }
  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    values,
  );
  return Number(rows[0].id);
}

before(async () => {
  // The password-reset throttles exist to stop abuse; the suite makes many
  // requests from one IP, so raise the limits for the run and test the limiter
  // explicitly in its own test. The values are read per request, so no restart
  // is needed (and the development server's own limits are untouched).
  process.env.PASSWORD_RESET_EMAIL_LIMIT = "1000";
  process.env.PASSWORD_RESET_IP_LIMIT = "1000";
  process.env.PASSWORD_RESET_ATTEMPT_LIMIT = "1000";

  try {
    await query("SELECT 1");
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    console.warn("DATABASE UNAVAILABLE - skipping auth integration tests.");
    return;
  }

  ids.customer = await createAccount("customer", CUSTOMER);
  ids.seller = await createAccount("seller", SELLER, {
    phone: "+15550000001",
    shop_name: "Test Shop",
    status: "approved",
  });
  ids.admin = await createAccount("admin", ADMIN);

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
});

after(async () => {
  if (dbAvailable) {
    // Delete only this run's rows, and only from tables this module owns.
    await query("DELETE FROM password_reset_tokens WHERE user_id = ANY($1)", [
      [ids.customer, ids.seller, ids.admin].filter(Boolean),
    ]);
    await query("DELETE FROM revoked_tokens WHERE user_id = ANY($1)", [
      [ids.customer, ids.seller, ids.admin].filter(Boolean),
    ]);
    await query("DELETE FROM customer WHERE id = $1", [ids.customer]);
    await query("DELETE FROM seller WHERE id = $1", [ids.seller]);
    await query("DELETE FROM admin WHERE id = $1", [ids.admin]);
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});


// -----------------------------------------------------------------------------
// Admin login
// -----------------------------------------------------------------------------
describe("POST /api/auth/admin/login", () => {
  test("signs in an existing admin and returns an admin-role token", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { status, data } = await api("/admin/login", {
      method: "POST",
      body: { email: ADMIN.email, password: ADMIN.password },
    });
    assert.equal(status, 200);
    assert.equal(data.success, true);
    assert.equal(data.user.role, "admin");
    assert.equal(data.user.email, ADMIN.email);
    assert.ok(data.token, "a token is returned");
    // Never leak password material.
    assert.equal(data.user.password_hash, undefined);
    assert.equal(data.user.password, undefined);
  });

  test("rejects a wrong password with a generic 401", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { status, data } = await api("/admin/login", {
      method: "POST",
      body: { email: ADMIN.email, password: "WrongPass123" },
    });
    assert.equal(status, 401);
    assert.equal(data.message, "Invalid email or password.");
  });

  test("cannot be used to enumerate admins (unknown email looks identical)", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const unknown = await api("/admin/login", {
      method: "POST",
      body: { email: `nobody.${RUN}@example.test`, password: "WrongPass123" },
    });
    const wrongPassword = await api("/admin/login", {
      method: "POST",
      body: { email: ADMIN.email, password: "WrongPass123" },
    });
    assert.equal(unknown.status, wrongPassword.status);
    assert.equal(unknown.data.message, wrongPassword.data.message);
  });

  test("a customer cannot log in through the admin endpoint", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { status } = await api("/admin/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    assert.equal(status, 401);
  });

  test("no admin registration endpoint exists", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { status } = await api("/admin/register", {
      method: "POST",
      body: { name: "x", email: "x@example.test", password: "Password123" },
    });
    assert.equal(status, 404);
  });
});

// -----------------------------------------------------------------------------
// Existing customer / seller flows must keep working
// -----------------------------------------------------------------------------
describe("customer + seller login (regression)", () => {
  test("customer login returns a customer token", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { status, data } = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    assert.equal(status, 200);
    assert.equal(data.user.role, "customer");
    assert.ok(data.token);
  });

  test("seller login returns a seller token and status", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { status, data } = await api("/seller/login", {
      method: "POST",
      body: { email: SELLER.email, password: SELLER.password },
    });
    assert.equal(status, 200);
    assert.equal(data.user.role, "seller");
    assert.equal(data.user.status, "approved");
  });

  test("GET /me works with a Bearer token", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const login = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    const { status, data } = await api("/me", { token: login.data.token });
    assert.equal(status, 200);
    assert.equal(data.user.email, CUSTOMER.email);
  });

  test("GET /me rejects a garbage token", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { status } = await api("/me", { token: "not.a.jwt" });
    assert.equal(status, 401);
  });

  test("a customer token cannot reach seller-only routes", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const login = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    const { status } = await api("/seller/profile", {
      method: "PUT",
      token: login.data.token,
      body: { name: "Hacked" },
    });
    assert.equal(status, 403);
  });

// -----------------------------------------------------------------------------
// Logout: real server-side revocation
// -----------------------------------------------------------------------------
describe("POST /api/auth/logout", () => {
  test("revokes the token server-side (it stops working immediately)", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const login = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    const token = login.data.token;

    // Sanity: the token works before logout.
    assert.equal((await api("/me", { token })).status, 200);

    const out = await api("/logout", { method: "POST", token });
    assert.equal(out.status, 200);
    assert.equal(out.data.tokenInvalidated, true);

    // The SAME token must now be rejected - this is the whole point.
    const after = await api("/me", { token });
    assert.equal(after.status, 401);
    assert.match(after.data.message, /signed out/i);
  });

  test("revoking one token leaves other sessions of the same user alive", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const first = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    const second = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });

    await api("/logout", { method: "POST", token: first.data.token });

    assert.equal((await api("/me", { token: first.data.token })).status, 401);
    assert.equal((await api("/me", { token: second.data.token })).status, 200);
  });

  test("requires authentication", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    assert.equal((await api("/logout", { method: "POST" })).status, 401);
  });
});

// -----------------------------------------------------------------------------
// Token version: a password change invalidates every other session
// -----------------------------------------------------------------------------
describe("PUT /api/auth/change-password", () => {
  test("invalidates other sessions but keeps the caller signed in", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const oldPassword = "CustomerPass123";
    const newPassword = "CustomerPass456";

    const deviceA = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: oldPassword },
    });
    const deviceB = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: oldPassword },
    });
    assert.equal(deviceA.status, 200);
    assert.equal(deviceB.status, 200);

    const changed = await api("/change-password", {
      method: "PUT",
      token: deviceA.data.token,
      body: { currentPassword: oldPassword, newPassword },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.data.otherSessionsInvalidated, true);
    assert.ok(changed.data.token, "a fresh token is issued to the caller");

    // Device B's old token is dead...
    assert.equal((await api("/me", { token: deviceB.data.token })).status, 401);
    // ...device A's NEW token works...
    assert.equal((await api("/me", { token: changed.data.token })).status, 200);
    // ...and device A's OLD token is dead too.
    assert.equal((await api("/me", { token: deviceA.data.token })).status, 401);

    // The new password is the one that now works.
    const relogin = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: newPassword },
    });
    assert.equal(relogin.status, 200);

    // Restore the fixture password for the remaining tests.
    await query("UPDATE customer SET password_hash = $1 WHERE id = $2", [
      await bcrypt.hash(oldPassword, TEST_ROUNDS),
      ids.customer,
    ]);
  });

  test("rejects a wrong current password", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const login = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    const { status } = await api("/change-password", {
      method: "PUT",
      token: login.data.token,
      body: {
        currentPassword: "DefinitelyWrong1",
        newPassword: "AnotherPass789",
      },
    });
    assert.equal(status, 401);
  });

  test("weak new passwords are rejected", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const login = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    const { status } = await api("/change-password", {
      method: "PUT",
      token: login.data.token,
      body: { currentPassword: CUSTOMER.password, newPassword: "short" },
    });
    assert.equal(status, 400);
  });
});


// -----------------------------------------------------------------------------
// Password recovery
// -----------------------------------------------------------------------------
// The full flow is exercised end to end. `AUTH_EXPOSE_RESET_TOKEN=true` makes
// the endpoint return the link it just emailed; that flag exists for exactly
// this (local development and automated tests) and is refused in production.
async function requestResetLink(email) {
  const previous = process.env.AUTH_EXPOSE_RESET_TOKEN;
  process.env.AUTH_EXPOSE_RESET_TOKEN = "true";
  try {
    const { status, data } = await api("/forgot-password", {
      method: "POST",
      body: { email },
    });
    const token = data?.devResetUrl
      ? decodeURIComponent(data.devResetUrl.split("token=")[1])
      : null;
    return { status, data, token };
  } finally {
    if (previous === undefined) delete process.env.AUTH_EXPOSE_RESET_TOKEN;
    else process.env.AUTH_EXPOSE_RESET_TOKEN = previous;
  }
}

describe("POST /api/auth/forgot-password", () => {
  test("always answers with the same message (no account enumeration)", async (t) => {
    if (!dbAvailable) return t.skip("no database");

    const known = await api("/forgot-password", {
      method: "POST",
      body: { email: CUSTOMER.email },
    });
    const unknown = await api("/forgot-password", {
      method: "POST",
      body: { email: `nobody.${RUN}@example.test` },
    });

    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.equal(known.data.message, unknown.data.message);
  });

  test("stores only the SHA-256 hash, unused, with a future expiry", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    await api("/forgot-password", {
      method: "POST",
      body: { email: CUSTOMER.email },
    });

    const { rows } = await query(
      `SELECT token_hash, expires_at, used_at
         FROM password_reset_tokens
        WHERE user_id = $1 AND role = 'customer'
        ORDER BY created_at DESC LIMIT 1`,
      [ids.customer],
    );
    const record = rows[0];
    assert.ok(record, "a reset token row was created");
    assert.equal(record.token_hash.length, 64, "SHA-256 hex digest");
    assert.match(record.token_hash, /^[0-9a-f]{64}$/);
    assert.equal(record.used_at, null);
    assert.ok(new Date(record.expires_at).getTime() > Date.now());
  });

  test("the raw token is not the stored value", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { token } = await requestResetLink(CUSTOMER.email);
    assert.ok(token, "a raw token is generated");
    const { rows } = await query(
      "SELECT token_hash FROM password_reset_tokens WHERE user_id = $1 AND role = 'customer' AND used_at IS NULL",
      [ids.customer],
    );
    assert.notEqual(rows[0].token_hash, token);
  });

  test("rejects a malformed email address", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { status } = await api("/forgot-password", {
      method: "POST",
      body: { email: "not-an-email" },
    });
    assert.equal(status, 400);
  });

  test("requesting a new link invalidates the previous one", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    await api("/forgot-password", {
      method: "POST",
      body: { email: SELLER.email },
    });
    await api("/forgot-password", {
      method: "POST",
      body: { email: SELLER.email },
    });

    const { rows } = await query(
      `SELECT used_at FROM password_reset_tokens
        WHERE user_id = $1 AND role = 'seller' AND used_at IS NULL`,
      [ids.seller],
    );
    assert.equal(rows.length, 1, "only the newest token stays usable");
  });

  test("works for seller and admin accounts as well as customers", async (t) => {
    if (!dbAvailable) return t.skip("no database");

    const seller = await requestResetLink(SELLER.email);
    assert.equal(seller.status, 200);
    assert.ok(seller.token);

    const admin = await requestResetLink(ADMIN.email);
    assert.equal(admin.status, 200);
    assert.ok(admin.token);

    const { rows } = await query(
      `SELECT role FROM password_reset_tokens
        WHERE user_id = ANY($1) AND used_at IS NULL ORDER BY role`,
      [[ids.seller, ids.admin]],
    );
    assert.deepEqual(
      rows.map((row) => row.role),
      ["admin", "seller"],
    );
  });

  test("rate limits repeated requests for the same address", async (t) => {
    if (!dbAvailable) return t.skip("no database");

    // Tighten the limit for this one request, then restore it.
    const previous = process.env.PASSWORD_RESET_EMAIL_LIMIT;
    process.env.PASSWORD_RESET_EMAIL_LIMIT = "1";
    try {
      const first = await api("/forgot-password", {
        method: "POST",
        body: { email: `throttle.${RUN}@example.test` },
      });
      assert.equal(first.status, 200);

      const second = await api("/forgot-password", {
        method: "POST",
        body: { email: `throttle.${RUN}@example.test` },
      });
      assert.equal(second.status, 429);
      assert.ok(second.response.headers.get("retry-after"));
    } finally {
      process.env.PASSWORD_RESET_EMAIL_LIMIT = previous;
    }
  });
});

describe("POST /api/auth/reset-password", () => {
  test("completes the full recovery flow and invalidates old sessions", async (t) => {
    if (!dbAvailable) return t.skip("no database");

    // A session that must be killed by the reset.
    const existing = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    assert.equal(existing.status, 200);

    const { token } = await requestResetLink(CUSTOMER.email);
    assert.ok(token, "the reset link contains a token");

    const newPassword = "CustomerReset999";
    const { status, data } = await api("/reset-password", {
      method: "POST",
      body: { token, newPassword },
    });
    assert.equal(status, 200);
    assert.equal(data.allSessionsInvalidated, true);

    // Every pre-existing session is dead...
    assert.equal((await api("/me", { token: existing.data.token })).status, 401);

    // ...the new password works...
    const relogin = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: newPassword },
    });
    assert.equal(relogin.status, 200);

    // ...and the old one does not.
    assert.equal(
      (
        await api("/customer/login", {
          method: "POST",
          body: { email: CUSTOMER.email, password: CUSTOMER.password },
        })
      ).status,
      401,
    );

    // Restore the fixture password for the remaining tests.
    await query("UPDATE customer SET password_hash = $1 WHERE id = $2", [
      await bcrypt.hash(CUSTOMER.password, TEST_ROUNDS),
      ids.customer,
    ]);
  });

  test("a reset token is single use", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { token } = await requestResetLink(CUSTOMER.email);

    const first = await api("/reset-password", {
      method: "POST",
      body: { token, newPassword: "ReuseTest111" },
    });
    assert.equal(first.status, 200);

    const second = await api("/reset-password", {
      method: "POST",
      body: { token, newPassword: "ReuseTest222" },
    });
    assert.equal(second.status, 400);
    assert.match(second.data.message, /invalid or has expired/i);

    await query("UPDATE customer SET password_hash = $1 WHERE id = $2", [
      await bcrypt.hash(CUSTOMER.password, TEST_ROUNDS),
      ids.customer,
    ]);
  });

  test("an expired token is rejected", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { token } = await requestResetLink(CUSTOMER.email);

    // Force the stored row into the past.
    await query(
      `UPDATE password_reset_tokens SET expires_at = NOW() - INTERVAL '1 minute'
        WHERE user_id = $1 AND role = 'customer' AND used_at IS NULL`,
      [ids.customer],
    );

    const { status, data } = await api("/reset-password", {
      method: "POST",
      body: { token, newPassword: "ExpiredTest123" },
    });
    assert.equal(status, 400);
    assert.match(data.message, /invalid or has expired/i);
  });

  test("an unknown token is rejected with the same message", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { status, data } = await api("/reset-password", {
      method: "POST",
      body: {
        token: `totally-made-up-token-${RUN}-000000000000000000`,
        newPassword: "UnknownTest123",
      },
    });
    assert.equal(status, 400);
    assert.match(data.message, /invalid or has expired/i);
  });

  test("enforces the password policy before consuming the token", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { token } = await requestResetLink(CUSTOMER.email);

    const { status } = await api("/reset-password", {
      method: "POST",
      body: { token, newPassword: "weak" },
    });
    assert.equal(status, 400);

    // The token must still be usable, so the user can retry properly.
    const { rows } = await query(
      `SELECT used_at FROM password_reset_tokens
        WHERE user_id = $1 AND role = 'customer' AND used_at IS NULL`,
      [ids.customer],
    );
    assert.equal(rows.length, 1, "the token was not consumed");
  });

  test("works for an admin account", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { token } = await requestResetLink(ADMIN.email);

    const { status } = await api("/reset-password", {
      method: "POST",
      body: { token, newPassword: "AdminReset777" },
    });
    assert.equal(status, 200);

    assert.equal(
      (
        await api("/admin/login", {
          method: "POST",
          body: { email: ADMIN.email, password: ADMIN.password },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await api("/admin/login", {
          method: "POST",
          body: { email: ADMIN.email, password: "AdminReset777" },
        })
      ).status,
      200,
    );

    await query("UPDATE admin SET password_hash = $1 WHERE id = $2", [
      await bcrypt.hash(ADMIN.password, TEST_ROUNDS),
      ids.admin,
    ]);
  });
});


// -----------------------------------------------------------------------------
// HttpOnly cookie transport (AUTH_COOKIE_MODE)
// -----------------------------------------------------------------------------
describe("HttpOnly cookie mode", () => {
  test("is off by default: the body token is the only transport", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    const { data, response } = await api("/customer/login", {
      method: "POST",
      body: { email: CUSTOMER.email, password: CUSTOMER.password },
    });
    assert.equal(data.tokenTransport, "body");
    assert.equal(response.headers.get("set-cookie"), null);
  });

  test("sets an HttpOnly cookie that authenticates requests", async (t) => {
    if (!dbAvailable) return t.skip("no database");

    // cookie mode is read from the environment per request, so flipping it here
    // exercises the real code path without restarting the server.
    process.env.AUTH_COOKIE_MODE = "true";
    try {
      const login = await api("/customer/login", {
        method: "POST",
        body: { email: CUSTOMER.email, password: CUSTOMER.password },
      });
      assert.equal(login.data.tokenTransport, "cookie");

      const setCookie = login.response.headers.get("set-cookie");
      assert.ok(setCookie, "a Set-Cookie header is present");
      assert.match(setCookie, /omp_token=/);
      assert.match(setCookie, /HttpOnly/i, "JavaScript cannot read the token");
      assert.match(setCookie, /SameSite=Lax/i);
      assert.match(setCookie, /Path=\//);

      const cookie = setCookie.split(";")[0];

      // A GET with only the cookie (no Authorization header) is authenticated.
      const me = await api("/me", { cookie });
      assert.equal(me.status, 200);
      assert.equal(me.data.user.email, CUSTOMER.email);
    } finally {
      delete process.env.AUTH_COOKIE_MODE;
    }
  });

  test("blocks cookie-authenticated writes without the CSRF header", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    process.env.AUTH_COOKIE_MODE = "true";
    try {
      const login = await api("/customer/login", {
        method: "POST",
        body: { email: CUSTOMER.email, password: CUSTOMER.password },
      });
      const cookie = login.response.headers.get("set-cookie").split(";")[0];

      // No X-Requested-With -> a cross-site form could have produced this.
      const blocked = await api("/logout", { method: "POST", cookie });
      assert.equal(blocked.status, 403);
      assert.match(blocked.data.message, /forgery/i);
    } finally {
      delete process.env.AUTH_COOKIE_MODE;
    }
  });

  test("logout clears the cookie and revokes the token", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    process.env.AUTH_COOKIE_MODE = "true";
    try {
      const login = await api("/customer/login", {
        method: "POST",
        body: { email: CUSTOMER.email, password: CUSTOMER.password },
      });
      const cookie = login.response.headers.get("set-cookie").split(";")[0];

      const logout = await api("/logout", {
        method: "POST",
        cookie,
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      assert.equal(logout.status, 200);
      assert.equal(logout.data.tokenInvalidated, true);
      assert.match(
        logout.response.headers.get("set-cookie") || "",
        /omp_token=;/,
        "the cookie is cleared",
      );

      // The cookie's token is revoked server-side.
      assert.equal((await api("/me", { cookie })).status, 401);
    } finally {
      delete process.env.AUTH_COOKIE_MODE;
    }
  });

  test("the Authorization header still wins when both are sent", async (t) => {
    if (!dbAvailable) return t.skip("no database");
    process.env.AUTH_COOKIE_MODE = "true";
    try {
      const stale = await api("/customer/login", {
        method: "POST",
        body: { email: CUSTOMER.email, password: CUSTOMER.password },
      });
      const fresh = await api("/customer/login", {
        method: "POST",
        body: { email: CUSTOMER.email, password: CUSTOMER.password },
      });
      const staleCookie = stale.response.headers.get("set-cookie").split(";")[0];

      // Revoke the stale token, then send BOTH: the Bearer token must be used.
      await api("/logout", { method: "POST", token: stale.data.token });

      const { status, data } = await api("/me", {
        token: fresh.data.token,
        cookie: staleCookie,
      });
      assert.equal(status, 200);
      assert.equal(data.user.email, CUSTOMER.email);
    } finally {
      delete process.env.AUTH_COOKIE_MODE;
    }
  });
});

});

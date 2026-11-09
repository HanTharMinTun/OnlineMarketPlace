// =============================================================================
// authService.js - single place that talks to the auth backend
// =============================================================================
// Backend mount point: /api/auth  (see omp-backend/src/app.js + auth.js).
// The base URL comes from Vite env (VITE_API_BASE_URL) and is NEVER hardcoded
// inside a page component.
//
// TOKEN TRANSPORT - two modes, chosen by the backend's AUTH_COOKIE_MODE setting:
//
//   * Cookie mode (recommended, AUTH_COOKIE_MODE=true on the server)
//       The backend sets an HttpOnly + SameSite cookie. JavaScript cannot read
//       it, so a successful XSS cannot exfiltrate the session. Nothing is stored
//       in local/session storage and the app simply sends `credentials:
//       'include'` on every request.
//
//   * Bearer mode (default)
//       The backend returns the JWT in the JSON body and expects
//       `Authorization: Bearer <token>`. The token is kept in browser storage:
//         localStorage   -> "Remember me" (survives restarts)
//         sessionStorage -> otherwise (cleared when the browser closes)
//       XSS WARNING: any script on this origin can read the token. Keep
//       escaping React output (never dangerouslySetInnerHTML with user data),
//       avoid third-party scripts, and use HTTPS in production.
//
// This client supports BOTH at once: it always sends `credentials: 'include'`
// and always attaches the Bearer token when one is present in storage. The
// backend prefers the Authorization header, so an existing session keeps
// working across the changeover.
//
// CSRF: cookie-authenticated writes send an `X-Requested-With` header that a
// cross-site form cannot produce (see authMiddleware.csrfGuard).
// =============================================================================

/** Vite env var (set it in omp-ui/.env). Falls back to the documented dev server. */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
).replace(/\/+$/, '');

const TOKEN_KEY = 'omp.auth.token';

/** Thrown for every failed request so callers get one predictable shape. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'ERROR', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// --- token storage ----------------------------------------------------------

/** Read the token from session storage first, then persistent storage. */
export function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Persist the JWT. `persist: true` = "Remember me" (localStorage),
 * otherwise the token only lives for the browser session.
 */
export function storeToken(token, { persist = false } = {}) {
  if (!token) return;
  try {
    if (persist) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage may be blocked (private mode) - the session still works in memory */
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** True when the current token lives in localStorage ("Remember me"). */
export function isTokenPersisted() {
  try {
    return localStorage.getItem(TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Swap the stored token for a freshly issued one, keeping it in the same
 * storage area it was in before.
 *
 * Needed because the backend bumps the account's token_version whenever the
 * password changes: every previously issued token (including this device's) is
 * rejected from that moment on, and the response carries the replacement.
 */
export function replaceStoredToken(token) {
  if (!token) return;
  storeToken(token, { persist: isTokenPersisted() });
}

// --- session hint ------------------------------------------------------------
// In cookie mode the JWT is invisible to JavaScript, so the SPA cannot tell
// whether a session exists without asking the server. This flag avoids an extra
// `/auth/me` round-trip (and its 401) for every anonymous visitor.
//
// It contains NO credential and NO personal data - only the string "1". An
// attacker who sets it gains nothing: every protected endpoint still verifies
// the real token on the server, and a missing/invalid session simply produces a
// 401 that clears the hint again.
const SESSION_HINT_KEY = 'omp.auth.session';

export function markSessionPossible() {
  try {
    localStorage.setItem(SESSION_HINT_KEY, '1');
  } catch {
    /* storage may be blocked - the app still works, it just probes /auth/me */
  }
}

export function hasSessionHint() {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearSessionHint() {
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* ignore */
  }
}

// --- low level request helper ----------------------------------------------

/** Map a backend status/body to a friendly, user-safe message. */
function friendlyMessage(status, serverMessage) {
  if (status === 0) return serverMessage; // already a network-level message
  if (status === 400) return serverMessage || 'Please check the information you entered.';
  if (status === 401) return serverMessage || 'Invalid email or password.';
  if (status === 403) return serverMessage || 'You are not allowed to perform this action.';
  if (status === 404) return serverMessage || 'The requested resource was not found.';
  if (status === 409) return serverMessage || 'An account with this email already exists.';
  if (status === 429) return serverMessage || 'Too many attempts. Please try again later.';
  if (status >= 500) return 'The server ran into a problem. Please try again shortly.';
  return serverMessage || 'Something went wrong. Please try again.';
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // A custom header a cross-site <form> cannot set; required by the backend's
  // CSRF guard for cookie-authenticated writes. Harmless in Bearer mode.
  headers['X-Requested-With'] = 'XMLHttpRequest';

  if (auth) {
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      // Sends and stores the HttpOnly session cookie when the backend uses
      // cookie mode. Safe to always include; it is ignored in Bearer mode.
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch rejects only for network/CORS/DNS failures.
    throw new ApiError(
      'Unable to reach the server. Check your connection and try again.',
      { status: 0, code: 'NETWORK' },
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null; // e.g. an HTML error page from a proxy
  }

  if (!response.ok || (data && data.success === false)) {
    throw new ApiError(friendlyMessage(response.status, data?.message), {
      status: response.status,
      code: response.status === 0 ? 'NETWORK' : 'HTTP_ERROR',
      details: data,
    });
  }

  if (!data) {
    throw new ApiError('The server returned an unexpected response.', {
      status: response.status,
      code: 'BAD_RESPONSE',
    });
  }

  return data;
}

// =============================================================================
// Customer
// =============================================================================

/**
 * POST /api/auth/customer/register
 * Sends ONLY the fields the backend accepts (name, email, password, phone).
 * No id / role / password_hash / status is ever sent.
 */
export function registerCustomer({ name, email, password, phone }) {
  return request('/auth/customer/register', {
    method: 'POST',
    body: { name, email, password, phone },
  });
}

/**
 * POST /api/auth/customer/login
 * @returns {{ success: true, message: string, token: string, user: object }}
 */
export function loginCustomer({ email, password }) {
  return request('/auth/customer/login', {
    method: 'POST',
    body: { email, password },
  });
}

// =============================================================================
// Seller
// =============================================================================

/**
 * POST /api/auth/seller/register
 * `status` is intentionally omitted: the backend/table default ("pending")
 * applies and the client can never self-approve.
 */
export function registerSeller({
  name,
  email,
  password,
  phone,
  shop_name,
  address,
  id_card,
  kpay_phone,
  bank_acc,
}) {
  return request('/auth/seller/register', {
    method: 'POST',
    body: {
      name,
      email,
      password,
      phone,
      shop_name,
      address,
      id_card,
      kpay_phone,
      bank_acc,
    },
  });
}

/**
 * POST /api/auth/seller/login
 * Pending sellers CAN log in (the response then contains requiresApproval).
 * Suspended sellers get 403.
 */
export function loginSeller({ email, password }) {
  return request('/auth/seller/login', {
    method: 'POST',
    body: { email, password },
  });
}

// =============================================================================
// Admin
// =============================================================================
// Admin accounts are created directly in PostgreSQL by the developer. The
// backend intentionally ships NO public admin registration route.
//
// POST /api/auth/admin/login now exists (omp-backend/src/auth_and_user/auth.js,
// section E). The 404 mapping below is kept as a safety net for a deployment
// that is still running an older backend: it reports the truth instead of
// pretending a login succeeded.
export const ADMIN_LOGIN_PATH = '/auth/admin/login';

export async function loginAdmin({ email, password }) {
  try {
    return await request(ADMIN_LOGIN_PATH, {
      method: 'POST',
      body: { email, password },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(
        'Admin sign-in is not available on this server: the backend does not ' +
          `expose POST ${API_BASE_URL}${ADMIN_LOGIN_PATH}. Admin accounts are ` +
          'created directly in PostgreSQL by the developer.',
        { status: 404, code: 'NOT_IMPLEMENTED' },
      );
    }
    throw error;
  }
}

// =============================================================================
// Password recovery
// =============================================================================
// Backend routes: K. POST /api/auth/forgot-password and
//                 L. POST /api/auth/reset-password
//
// Neither endpoint reveals whether an email address has an account, so a 200
// only means "the request was accepted", never "an email was sent". The
// `emailSent` field in the response says which actually happened.

/**
 * POST /api/auth/forgot-password
 * @returns {{ success: true, message: string, emailSent?: boolean }}
 */
export function forgotPassword({ email }) {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: { email },
  });
}

/**
 * POST /api/auth/reset-password
 * Consumes the single-use token from the reset link and sets the new password.
 * The backend then invalidates every existing session for that account.
 */
export function resetPassword({ token, newPassword }) {
  return request('/auth/reset-password', {
    method: 'POST',
    body: { token, newPassword },
  });
}

// =============================================================================
// Session / profile (all of these require the Bearer token)
// =============================================================================

/** GET /api/auth/me -> { success, message, user } (customer | seller | admin) */
export function getCurrentUser() {
  return request('/auth/me', { auth: true });
}

/**
 * PUT /api/auth/customer/profile
 * Only { name, phone } are accepted; nothing else is forwarded so a stray
 * field can never become a mass-assignment attempt.
 */
export function updateCustomerProfile({ name, phone }) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (phone !== undefined) body.phone = phone;
  return request('/auth/customer/profile', { method: 'PUT', body, auth: true });
}

/**
 * PUT /api/auth/seller/profile
 * Seller-editable fields only: name, phone, shop_name, address.
 * status / email / id / kpay_phone / bank_acc are never sent.
 */
export function updateSellerProfile({ name, phone, shop_name, address }) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (phone !== undefined) body.phone = phone;
  if (shop_name !== undefined) body.shop_name = shop_name;
  if (address !== undefined) body.address = address;
  return request('/auth/seller/profile', { method: 'PUT', body, auth: true });
}

/**
 * PUT /api/auth/change-password -> { currentPassword, newPassword }
 *
 * Changing the password invalidates EVERY session for the account server-side
 * (the token_version is bumped). The response therefore contains a replacement
 * token for this device, which is stored here so the user is not signed out of
 * the tab they are working in. Other devices must sign in again.
 */
export async function changePassword({ currentPassword, newPassword }) {
  const data = await request('/auth/change-password', {
    method: 'PUT',
    body: { currentPassword, newPassword },
    auth: true,
  });
  replaceStoredToken(data?.token);
  return data;
}

/**
 * POST /api/auth/logout
 *
 * The backend now revokes the token server-side (its `jti` is blacklisted) and
 * clears the HttpOnly session cookie, so the response reports
 * `tokenInvalidated: true`. The client must still drop its own copy -
 * `clearStoredToken()` does that - because a Bearer token lives in web storage.
 */
export async function logout() {
  try {
    return await request('/auth/logout', { method: 'POST', auth: true });
  } catch (error) {
    // Logout must never trap the user in a logged-in UI: swallow 401/network
    // errors and let the caller clear local state anyway.
    if (error instanceof ApiError) return { success: false, message: error.message };
    throw error;
  }
}

export const authService = {
  API_BASE_URL,
  ADMIN_LOGIN_PATH,
  getStoredToken,
  storeToken,
  clearStoredToken,
  markSessionPossible,
  hasSessionHint,
  clearSessionHint,
  replaceStoredToken,
  registerCustomer,
  loginCustomer,
  registerSeller,
  loginSeller,
  loginAdmin,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  updateCustomerProfile,
  updateSellerProfile,
  changePassword,
  logout,
};

export default authService;

// =============================================================================
// AuthProvider - the single source of authentication state for the SPA
// =============================================================================
// State exposed through context:
//   user, token, isAuthenticated, isLoading, error
// Functions:
//   login(userData, token, options)  logout()  refreshUser()  hasRole(role)
//   hasAnyRole(roles)  isSellerApproved()
//
// Design notes / limits:
//   * The role used anywhere in the UI comes from the VERIFIED backend response
//     (`/api/auth/me`), never from localStorage or from a URL parameter.
//   * `isSellerApproved()` is a convenience flag for the UI only. The backend
//     re-checks the seller's `status` column on every protected endpoint, so a
//     pending/suspended seller gains nothing by tampering with client state.
//   * `login()` cannot be told what role to use; it accepts the user object the
//     backend returned.
//   * TWO token transports are supported (see authService.js):
//       - Bearer mode: the JWT is kept in session/local storage and `token` is
//         the readable copy. `isAuthenticated` is then `Boolean(user && token)`.
//       - Cookie mode (backend AUTH_COOKIE_MODE=true): the JWT lives in an
//         HttpOnly cookie that JavaScript cannot read, so `token` stays null and
//         `isAuthenticated` is `Boolean(user)`. Nothing sensitive is persisted;
//         a non-credential "session may exist" hint avoids a pointless
//         `/auth/me` probe for anonymous visitors.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import authService from '../services/authService.js';
import { ROLES, isApprovedSeller, isKnownRole } from '../utils/roles.js';
import { AuthContext } from './authContext.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => authService.getStoredToken());
  // True while a stored session (or a possible cookie session) is validated.
  const [isLoading, setIsLoading] = useState(
    () => Boolean(authService.getStoredToken()) || authService.hasSessionHint(),
  );
  const [error, setError] = useState(null);

  // True when the backend told us the session lives in an HttpOnly cookie, so
  // there is no readable token. State (not a ref) because it affects rendering.
  const [cookieMode, setCookieMode] = useState(false);

  // Guards against a slow bootstrap response overwriting a fresh login/logout.
  const bootstrappedRef = useRef(false);

  /** Drop every trace of the session (client side). */
  const clearSession = useCallback(() => {
    authService.clearStoredToken();
    authService.clearSessionHint();
    setCookieMode(false);
    setToken(null);
    setUser(null);
    setError(null);
  }, []);

  /** Is there any reason to believe a session might exist? */
  const hasPossibleSession = useCallback(
    () => Boolean(authService.getStoredToken()) || authService.hasSessionHint(),
    [],
  );

  /** Validate the session against the backend and load the fresh profile. */
  const refreshUser = useCallback(async () => {
    if (!hasPossibleSession()) {
      clearSession();
      return null;
    }
    try {
      const data = await authService.getCurrentUser();
      const freshUser = data?.user ?? null;
      if (!freshUser || !isKnownRole(freshUser.role)) {
        clearSession();
        return null;
      }
      // The session is real, so the hint stays accurate across reloads.
      authService.markSessionPossible();
      const stored = authService.getStoredToken();
      // A validated session with no readable token can only be a cookie
      // session, so re-detect the transport after a page reload.
      setCookieMode(!stored);
      setToken(stored);
      setUser(freshUser);
      setError(null);
      return freshUser;
    } catch (err) {
      // Expired / revoked / invalid token (or the account was deleted)
      // -> the whole local session must go.
      if (err?.status === 401 || err?.status === 403 || err?.status === 404) {
        clearSession();
      } else {
        setError(err?.message || 'Unable to load your session.');
      }
      return null;
    }
  }, [clearSession, hasPossibleSession]);

  // On first mount: restore an existing session if one may exist.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    let cancelled = false;
    (async () => {
      if (!hasPossibleSession()) {
        setIsLoading(false);
        return;
      }
      await refreshUser();
      if (!cancelled) setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshUser, hasPossibleSession]);

  /**
   * Store the session returned by a login endpoint.
   *
   * @param {object} userData  the `user` object from the backend response
   * @param {string} [authToken] the JWT from the backend response. Ignored in
   *   cookie mode, where the HttpOnly cookie IS the session and keeping a
   *   readable copy in web storage would defeat the point of using a cookie.
   * @param {{ remember?: boolean, tokenTransport?: 'body'|'cookie' }} [options]
   */
  const login = useCallback((userData, authToken, options = {}) => {
    if (!userData) {
      throw new Error('login() requires the user object returned by the backend.');
    }

    const isCookieMode = options.tokenTransport === 'cookie';
    setCookieMode(isCookieMode);

    if (isCookieMode) {
      authService.clearStoredToken();
      authService.markSessionPossible();
      setToken(null);
    } else {
      if (!authToken) {
        throw new Error(
          'login() requires the token returned by the backend in Bearer mode.',
        );
      }
      authService.storeToken(authToken, { persist: Boolean(options.remember) });
      setToken(authToken);
    }

    setUser(userData);
    setError(null);
    setIsLoading(false);
  }, []);

  /** Clear the session locally; the backend call revokes the token remotely. */
  const logout = useCallback(async () => {
    const hadSession = hasPossibleSession();
    clearSession();
    if (hadSession) {
      // Revokes the token server-side (jti blacklist) and clears the cookie.
      await authService.logout();
    }
  }, [clearSession, hasPossibleSession]);

  const value = useMemo(
    () => ({
      user,
      token,
      // In cookie mode there is no readable token, so the verified user object
      // is the signal. Either way the backend re-verifies on every request.
      isAuthenticated: Boolean(user) && (Boolean(token) || cookieMode),
      isLoading,
      error,
      login,
      logout,
      refreshUser,
      hasRole: (role) => user?.role === role,
      hasAnyRole: (roles = []) => roles.includes(user?.role),
      isSellerApproved: () => isApprovedSeller(user),
      isSeller: () => user?.role === ROLES.SELLER,
      isAdmin: () => user?.role === ROLES.ADMIN,
      isCustomer: () => user?.role === ROLES.CUSTOMER,
    }),
    [user, token, cookieMode, isLoading, error, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;

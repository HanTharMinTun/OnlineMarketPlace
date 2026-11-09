// Role helpers shared by the router, ProtectedRoute and the auth pages.
//
// IMPORTANT: these values only exist to build URLs and to give the user a
// sensible redirect. They are NOT a security boundary - the backend decides
// what a role may actually do (see omp-backend/src/auth_and_user/authMiddleware.js).

export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  SELLER: 'seller',
  ADMIN: 'admin',
});

export const SELLER_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  SUSPENDED: 'suspended',
});

/** Where each role lands after a successful login. */
export const HOME_BY_ROLE = Object.freeze({
  [ROLES.CUSTOMER]: '/',
  [ROLES.SELLER]: '/seller/dashboard',
  [ROLES.ADMIN]: '/admin/dashboard',
});

/** The login page that belongs to a role. */
export const LOGIN_PATH_BY_ROLE = Object.freeze({
  [ROLES.CUSTOMER]: '/login',
  [ROLES.SELLER]: '/seller/login',
  [ROLES.ADMIN]: '/admin/login',
});

export function isKnownRole(role) {
  return Object.values(ROLES).includes(role);
}

export function homePathForRole(role) {
  return HOME_BY_ROLE[role] || '/';
}

export function loginPathForRole(role) {
  return LOGIN_PATH_BY_ROLE[role] || '/login';
}

/**
 * Pending sellers may log in (the backend allows it) but must not reach seller
 * features until an admin approves them. Suspended sellers are blocked outright.
 */
export function isApprovedSeller(user) {
  return user?.role === ROLES.SELLER && user?.status === SELLER_STATUS.APPROVED;
}

export function isSuspendedSeller(user) {
  return user?.role === ROLES.SELLER && user?.status === SELLER_STATUS.SUSPENDED;
}

export function isPendingSeller(user) {
  return user?.role === ROLES.SELLER && user?.status === SELLER_STATUS.PENDING;
}

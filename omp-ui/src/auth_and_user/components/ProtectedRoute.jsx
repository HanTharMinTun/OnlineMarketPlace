import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/authContext.js';
import { loginPathForRole, homePathForRole } from '../utils/roles.js';

/**
 * Client-side route guard.
 *
 * SECURITY: this only shapes the user experience. It is NOT a security
 * boundary - every protected backend endpoint independently verifies the JWT
 * and the role (see omp-backend/src/auth_and_user/authMiddleware.js). Never
 * expose data to these routes on the assumption that only the right role can
 * reach them.
 *
 * @param {string[]} allowedRoles roles allowed to see the wrapped route
 * @param {string} [redirectTo]  optional override for the "wrong role" case
 */
export default function ProtectedRoute({ allowedRoles = [], redirectTo, children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="auth-page">
        <div className="auth-loading" role="status" aria-live="polite">
          <span className="auth-spinner" />
          Checking your session…
        </div>
      </div>
    );
  }

  // Not signed in (or the token was rejected): send them to the matching login
  // page and remember where they wanted to go.
  if (!isAuthenticated) {
    const roleForLogin = allowedRoles[0];
    return (
      <Navigate
        to={loginPathForRole(roleForLogin)}
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  // Signed in but the role is not allowed here -> bounce to that role's home.
  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    return <Navigate to={redirectTo || homePathForRole(user?.role)} replace />;
  }

  return children;
}

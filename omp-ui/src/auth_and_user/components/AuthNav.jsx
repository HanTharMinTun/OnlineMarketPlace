import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/authContext.js';
import { ROLES } from '../utils/roles.js';
import '../styles/auth.css';
import '../styles/nav.css';

/**
 * Slim marketplace header that exposes the authentication entry points.
 * Shows "Sign in / Register" when signed out and the account menu when signed
 * in. Rendering only - it never decides what a user is allowed to do.
 */
export default function AuthNav() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="app-nav">
      <Link to="/" className="app-nav-brand">
        <span aria-hidden="true">🛍</span> Online Marketplace
      </Link>

      <nav className="app-nav-links" aria-label="Account">
        {isAuthenticated ? (
          <>
            <Link className="auth-link" to="/profile">
              {user?.name ? `Hi, ${user.name.split(' ')[0]}` : 'My account'}
            </Link>
            {user?.role === ROLES.ADMIN ? (
              <Link className="auth-link" to="/admin/dashboard">
                Admin dashboard
              </Link>
            ) : null}
            {user?.role === ROLES.SELLER ? (
              <Link className="auth-link" to="/seller/dashboard">
                Seller dashboard
              </Link>
            ) : null}
            <button type="button" className="auth-link" onClick={handleLogout}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link className="auth-link" to="/login">
              Sign in
            </Link>
            <Link className="auth-btn auth-btn-primary" to="/register">
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

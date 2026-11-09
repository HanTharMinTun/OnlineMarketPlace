import { Link } from 'react-router-dom';

import '../auth_and_user/styles/auth.css';

export default function NotFound() {
  return (
    <div className="auth-page">
      <div className="auth-page-inner">
        <section className="auth-panel">
          <h2>Page not found</h2>
          <p className="auth-panel-sub">
            The page you are looking for does not exist or has moved.
          </p>
          <div className="auth-actions">
            <Link className="auth-btn auth-btn-primary" to="/">
              Back to marketplace
            </Link>
            <Link className="auth-btn auth-btn-secondary" to="/login">
              Sign in
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

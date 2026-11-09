import { Link } from 'react-router-dom';

import { useAuth } from '../context/authContext.js';
import Alert from '../components/Alert.jsx';
import '../styles/auth.css';

/**
 * Placeholder admin dashboard.
 *
 * Admin accounts are created directly in PostgreSQL by the developer; there is
 * no admin registration page anywhere in this UI. The real admin dashboard
 * (seller approvals, moderation) will replace the placeholder body.
 */
export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div className="auth-page">
      <div className="auth-page-inner">
        <div className="auth-panel-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>Admin dashboard</h2>
            <span className="auth-badge auth-badge-role">admin</span>
          </div>
          <div className="auth-actions">
            <Link className="auth-btn auth-btn-secondary" to="/">
              Back to marketplace
            </Link>
            <Link className="auth-btn auth-btn-secondary" to="/profile">
              My account
            </Link>
          </div>
        </div>

        <Alert variant="info">
          Signed in as an administrator. Seller approval and moderation tools will
          appear here.
        </Alert>

        <section className="auth-panel">
          <h2>Administrator</h2>
          <p className="auth-panel-sub">
            Admin accounts are provisioned directly in the database by the
            developer and cannot be created or edited from this website.
          </p>

          <dl className="auth-dl">
            <div>
              <dt>Name</dt>
              <dd>{user?.name || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{user?.phone || '—'}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

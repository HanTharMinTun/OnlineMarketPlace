import { Link } from 'react-router-dom';

import { useAuth } from '../context/authContext.js';
import Alert from '../components/Alert.jsx';
import '../styles/auth.css';

/**
 * Placeholder seller dashboard.
 *
 * This module owns authentication only; the real seller dashboard (products,
 * orders, payouts) will replace the placeholder body. The important part here
 * is the gate: a pending seller is signed in but must NOT be given seller
 * features, and the backend enforces the same rule via requireActiveSeller.
 */
export default function SellerDashboard() {
  const { user, refreshUser } = useAuth();
  const status = user?.status;
  const approved = status === 'approved';

  return (
    <div className="auth-page">
      <div className="auth-page-inner">
        <div className="auth-panel-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>Seller dashboard</h2>
            <span className="auth-badge auth-badge-role">seller</span>{' '}
            {status ? <span className={`auth-badge auth-badge-${status}`}>{status}</span> : null}
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

        {!approved ? (
          <Alert variant="warning">
            Your shop is pending admin approval. You will be able to access seller
            features once your account is approved.
          </Alert>
        ) : (
          <Alert variant="success">
            Your shop is approved. Seller features are available.
          </Alert>
        )}

        <section className="auth-panel">
          <h2>{user?.shop_name || 'Your shop'}</h2>
          <p className="auth-panel-sub">
            {approved
              ? 'This is where your listings, orders and payouts will live.'
              : 'Seller tools stay locked until an administrator approves your shop.'}
          </p>

          <dl className="auth-dl">
            <div>
              <dt>Owner</dt>
              <dd>{user?.name || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email || '—'}</dd>
            </div>
            <div>
              <dt>Shop address</dt>
              <dd>{user?.address || '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`auth-badge auth-badge-${status}`}>{status || 'unknown'}</span>
              </dd>
            </div>
          </dl>

          <div className="auth-actions">
            <button type="button" className="auth-btn auth-btn-secondary" onClick={refreshUser}>
              Refresh my status
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

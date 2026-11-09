import { Link } from 'react-router-dom';

import '../styles/auth.css';

// Evaluated once at module load instead of on every render (keeps render pure).
const CURRENT_YEAR = new Date().getFullYear();

// Branding copy for the split-screen panel, per audience.
const ASIDE = {
  customer: {
    tagline: 'Everything you love, in one trusted marketplace.',
    lead: 'Sign in to track orders, save favourites and check out faster.',
    points: [
      'Thousands of verified sellers and products',
      'Secure checkout and buyer protection',
      'Order tracking and easy returns',
    ],
  },
  seller: {
    tagline: 'Grow your shop with a nationwide audience.',
    lead: 'Manage listings and orders from your seller dashboard.',
    points: [
      'Free to register - approval in minutes',
      'Simple shop and inventory management',
      'Payouts for KBZ Pay and bank accounts',
    ],
  },
  admin: {
    tagline: 'Marketplace administration.',
    lead: 'Operator access only. Seller approvals and platform oversight.',
    points: [
      'Review and approve seller applications',
      'Monitor marketplace activity',
      'Admin accounts are provisioned by the developer',
    ],
  },
};

/**
 * Split-screen authentication layout:
 *   left  -> brand / promotional panel
 *   right -> the form card supplied as `children`
 * Collapses to a single column on small screens (see auth.css).
 */
export default function AuthLayout({
  audience = 'customer',
  eyebrow,
  title,
  subtitle,
  children,
  footer = null,
}) {
  const aside = ASIDE[audience] || ASIDE.customer;

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Link to="/" className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">
            🛍
          </span>
          Online Marketplace
        </Link>

        <div className="auth-aside-copy">
          <h2>{aside.tagline}</h2>
          <p>{aside.lead}</p>
          <ul className="auth-points">
            {aside.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>

        {audience === 'admin' ? (
          <p className="auth-aside-foot">
            Unauthorised access attempts are logged.
          </p>
        ) : (
          <p className="auth-aside-foot">
            © {CURRENT_YEAR} Online Marketplace
          </p>
        )}
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <header className="auth-card-head">
            {eyebrow ? <span className="auth-eyebrow">{eyebrow}</span> : null}
            <h1>{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </header>

          {children}

          {footer ? <div className="auth-alt">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

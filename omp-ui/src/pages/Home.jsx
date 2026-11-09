import { Link } from 'react-router-dom';
import heroImg from '../assets/hero.png';
import reactLogo from '../assets/react.svg';
import viteLogo from '../assets/vite.svg';
import { useAuth } from '../auth_and_user/context/authContext.js';
import { ROLES, homePathForRole } from '../auth_and_user/utils/roles.js';
import '../App.css';

/**
 * Existing marketplace landing page (unchanged starter content) with an
 * authentication-aware call to action. No marketplace logic was rewritten -
 * only the account entry points were added.
 */
export default function Home() {
  const { isAuthenticated, user } = useAuth();

  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Online Marketplace</h1>
          <p>
            {isAuthenticated
              ? `Signed in as ${user?.name || user?.email}.`
              : 'Buy and sell with confidence. Create an account to get started.'}
          </p>
        </div>

        {isAuthenticated ? (
          <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className="auth-btn auth-btn-primary" to={homePathForRole(user?.role)}>
              {user?.role === ROLES.ADMIN
                ? 'Admin dashboard'
                : user?.role === ROLES.SELLER
                  ? 'Seller dashboard'
                  : 'Continue shopping'}
            </Link>
            <Link className="auth-btn auth-btn-secondary" to="/profile">
              My account
            </Link>
          </p>
        ) : (
          <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link className="auth-btn auth-btn-primary" to="/login">
              Sign in
            </Link>
            <Link className="auth-btn auth-btn-secondary" to="/register">
              Create account
            </Link>
            <Link className="auth-btn auth-btn-secondary" to="/seller/register">
              Sell on our marketplace
            </Link>
          </p>
        )}
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank" rel="noreferrer">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank" rel="noreferrer">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank" rel="noreferrer">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank" rel="noreferrer">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank" rel="noreferrer">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank" rel="noreferrer">
                <svg className="button-icon" role="presentation" aria-hidden="true">
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  );
}

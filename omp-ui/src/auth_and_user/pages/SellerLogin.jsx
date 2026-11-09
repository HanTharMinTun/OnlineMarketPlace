import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import AuthLayout from '../components/AuthLayout.jsx';
import AuthFormInput from '../components/AuthFormInput.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import AuthLoadingButton from '../components/AuthLoadingButton.jsx';
import Alert from '../components/Alert.jsx';
import authService from '../services/authService.js';
import { useAuth } from '../context/authContext.js';
import { ROLES, homePathForRole } from '../utils/roles.js';
import { validateEmail, validatePassword } from '../utils/validation.js';
import { validateAndFocus } from '../utils/formHelpers.js';

export default function SellerLogin() {
  const { isAuthenticated, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectTo = location.state?.from || homePathForRole(ROLES.SELLER);

  if (isAuthenticated) {
    return <Navigate to={homePathForRole(user?.role)} replace />;
  }

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
    if (serverError) setServerError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const { errors: nextErrors, isValid } = validateAndFocus({
      email: () => validateEmail(form.email),
      password: () => validatePassword(form.password),
    });
    setErrors(nextErrors);
    if (!isValid) return;

    setLoading(true);
    setServerError('');
    setNotice('');
    try {
      const data = await authService.loginSeller({
        email: form.email.trim(),
        password: form.password,
      });

      login(data.user, data.token, {
        remember: form.remember,
        tokenTransport: data.tokenTransport,
      });

      // The backend lets pending sellers log in but flags them with
      // requiresApproval / status === "pending". We must NOT assume the token
      // proves approval - the status comes from the server response.
      if (data.requiresApproval || data.user?.status === 'pending') {
        setNotice(
          'Signed in. Your shop is still pending admin approval, so seller features stay locked until an admin approves it.',
        );
        return; // stay on the page and show the status banner
      }

      navigate(redirectTo, { replace: true });
    } catch (error) {
      setServerError(error.message);
      setForm((prev) => ({ ...prev, password: '' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      audience="seller"
      eyebrow="Seller account"
      title="Seller sign in"
      subtitle="Manage your shop, listings and orders."
      footer={
        <>
          <div className="auth-alt-row">
            <span>Want to start selling?</span>
            <Link className="auth-link" to="/seller/register">
              Open a seller account
            </Link>
          </div>
          <div className="auth-alt-row">
            <Link className="auth-link" to="/login">
              ← Customer sign in
            </Link>
            <Link className="auth-link" to="/forgot-password">
              Forgot your password?
            </Link>
          </div>
        </>
      }
    >
      {notice ? (
        <Alert variant="warning">
          {notice}{' '}
          <Link className="auth-link" to="/profile">
            View my account
          </Link>
        </Alert>
      ) : null}
      {serverError ? <Alert variant="error">{serverError}</Alert> : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthFormInput
          label="Seller email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
          required
          autoComplete="email"
          inputMode="email"
          placeholder="shop@example.com"
          autoFocus
        />

        <PasswordInput
          label="Password"
          name="password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
          required
          autoComplete="current-password"
        />

        <div className="auth-row">
          <label className="auth-check" htmlFor="seller-remember-me">
            <input
              id="seller-remember-me"
              name="remember"
              type="checkbox"
              checked={form.remember}
              onChange={handleChange}
            />
            Remember me
          </label>
        </div>

        <AuthLoadingButton loading={loading} loadingText="Signing in…">
          Sign in to seller dashboard
        </AuthLoadingButton>
      </form>
    </AuthLayout>
  );
}

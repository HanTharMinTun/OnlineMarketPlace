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

export default function CustomerLogin() {
  const { isAuthenticated, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectTo = location.state?.from || homePathForRole(ROLES.CUSTOMER);

  // Someone already signed in does not need the login form.
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
    if (loading) return; // belt and braces against double submits

    const { errors: nextErrors, isValid } = validateAndFocus({
      email: () => validateEmail(form.email),
      password: () => validatePassword(form.password),
    });
    setErrors(nextErrors);
    if (!isValid) return;

    setLoading(true);
    setServerError('');
    try {
      const data = await authService.loginCustomer({
        email: form.email.trim(),
        password: form.password,
      });
      // `tokenTransport` tells us whether the backend set an HttpOnly cookie
      // (then nothing is stored locally) or returned a Bearer token.
      login(data.user, data.token, {
        remember: form.remember,
        tokenTransport: data.tokenTransport,
      });
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
      audience="customer"
      eyebrow="Customer account"
      title="Welcome back"
      subtitle="Sign in to continue shopping."
      footer={
        <>
          <div className="auth-alt-row">
            <span>New to Online Marketplace?</span>
            <Link className="auth-link" to="/register">
              Create a customer account
            </Link>
          </div>
          <div className="auth-alt-row">
            <Link className="auth-link" to="/forgot-password">
              Forgot your password?
            </Link>
            <Link className="auth-link" to="/seller/login">
              Seller sign in →
            </Link>
          </div>
        </>
      }
    >
      {serverError ? <Alert variant="error">{serverError}</Alert> : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthFormInput
          label="Email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
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
          <label className="auth-check" htmlFor="remember-me">
            <input
              id="remember-me"
              name="remember"
              type="checkbox"
              checked={form.remember}
              onChange={handleChange}
            />
            Remember me
          </label>
        </div>

        <AuthLoadingButton loading={loading} loadingText="Signing in…">
          Sign in
        </AuthLoadingButton>
      </form>
    </AuthLayout>
  );
}

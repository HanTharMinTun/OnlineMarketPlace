import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

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

// Admin accounts are created and managed directly in PostgreSQL by the
// developer. There is intentionally NO admin registration page or admin
// creation form anywhere in this UI.
export default function AdminLogin() {
  const { isAuthenticated, user, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={homePathForRole(user?.role)} replace />;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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
    try {
      const data = await authService.loginAdmin({
        email: form.email.trim(),
        password: form.password,
      });

      // Defence in depth: only accept the session if the backend really says
      // this account is an admin. The role is never taken from the URL or from
      // anything the client supplied.
      if (data?.user?.role !== ROLES.ADMIN) {
        setServerError('This account is not an administrator account.');
        setForm((prev) => ({ ...prev, password: '' }));
        return;
      }

      login(data.user, data.token, {
        remember: false,
        tokenTransport: data.tokenTransport,
      });
      navigate(homePathForRole(ROLES.ADMIN), { replace: true });
    } catch (error) {
      // Generic message for bad credentials; a dedicated explanation if the
      // deployment is still running a backend without the admin login route.
      setServerError(error.message);
      setForm((prev) => ({ ...prev, password: '' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      audience="admin"
      eyebrow="Restricted area"
      title="Administrator sign in"
      subtitle="Operator access to marketplace administration."
      footer={
        <div className="auth-alt-row">
          <Link className="auth-link" to="/login">
            ← Customer sign in
          </Link>
          <Link className="auth-link" to="/seller/login">
            Seller sign in
          </Link>
        </div>
      }
    >
      {serverError ? <Alert variant="error">{serverError}</Alert> : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthFormInput
          label="Admin email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
          required
          autoComplete="username"
          inputMode="email"
          placeholder="admin@example.com"
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

        <AuthLoadingButton loading={loading} loadingText="Verifying…">
          Sign in as administrator
        </AuthLoadingButton>
      </form>

      <Alert variant="info">
        Admin accounts cannot be created from this website. They are provisioned
        directly in the PostgreSQL database by the developer.
      </Alert>
    </AuthLayout>
  );
}

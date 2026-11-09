import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import AuthLayout from '../components/AuthLayout.jsx';
import AuthFormInput from '../components/AuthFormInput.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import AuthLoadingButton from '../components/AuthLoadingButton.jsx';
import Alert from '../components/Alert.jsx';
import authService from '../services/authService.js';
import {
  PASSWORD_RULE_TEXT,
  passwordStrength,
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from '../utils/validation.js';
import { validateAndFocus } from '../utils/formHelpers.js';

// =============================================================================
// Password recovery - two real screens in one file
// =============================================================================
// /forgot-password  -> request a reset link (POST /api/auth/forgot-password)
// /reset-password   -> choose a new password (POST /api/auth/reset-password)
//
// Both talk to the real backend endpoints. Neither invents success:
//   * the request form reports what the server said, including the honest
//     "this server has no mail transport configured" case, and
//   * the reset form only claims success when the API accepted the token.
//
// The backend deliberately returns the same message whether or not the address
// has an account, so this page never reveals which emails are registered.
// =============================================================================

/** Step 1: ask for a reset link. */
function RequestResetLink() {
  const [form, setForm] = useState({ email: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // { variant, message }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
    if (status) setStatus(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const { errors: nextErrors, isValid } = validateAndFocus({
      email: () => validateEmail(form.email),
    });
    setErrors(nextErrors);
    if (!isValid) return;

    setLoading(true);
    setStatus(null);
    try {
      const data = await authService.forgotPassword({
        email: form.email.trim(),
      });

      if (data?.emailSent === false) {
        // The request was accepted but no email left the server. Say so.
        setStatus({
          variant: 'warning',
          message:
            `${data.message} Note: this server has no mail transport ` +
            'configured, so the message was written to the server log instead ' +
            'of being delivered.',
        });
      } else {
        setStatus({ variant: 'success', message: data?.message });
      }
      setForm({ email: '' });
    } catch (error) {
      setStatus({ variant: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      audience="customer"
      eyebrow="Account help"
      title="Forgot your password?"
      subtitle="We will email you a single-use link to choose a new password."
      footer={
        <div className="auth-alt-row">
          <Link className="auth-link" to="/login">
            ← Back to customer sign in
          </Link>
          <Link className="auth-link" to="/seller/login">
            Seller sign in
          </Link>
        </div>
      }
    >
      {status ? <Alert variant={status.variant}>{status.message}</Alert> : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthFormInput
          label="Account email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          error={errors.email}
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          hint="Customer, seller and admin accounts are all supported."
          autoFocus
        />

        <AuthLoadingButton loading={loading} loadingText="Sending…">
          Send reset link
        </AuthLoadingButton>
      </form>

      <div className="auth-actions" style={{ marginTop: 20 }}>
        <Link className="auth-btn auth-btn-secondary" to="/login">
          Back to sign in
        </Link>
        <Link className="auth-btn auth-btn-secondary" to="/reset-password">
          I already have a link
        </Link>
      </div>
    </AuthLayout>
  );
}


/** Step 2: consume the token from the email and set a new password. */
function ChooseNewPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // The token arrives as ?token=... in the link from the email.
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
    if (status) setStatus(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    const { errors: nextErrors, isValid } = validateAndFocus({
      newPassword: () => validatePassword(form.newPassword),
      confirmPassword: () =>
        validateConfirmPassword(form.newPassword, form.confirmPassword),
    });
    setErrors(nextErrors);
    if (!isValid) return;

    setLoading(true);
    setStatus(null);
    try {
      const data = await authService.resetPassword({
        token,
        newPassword: form.newPassword,
      });
      setForm({ newPassword: '', confirmPassword: '' });
      setStatus({ variant: 'success', message: data?.message });
      // Send them to the sign-in page shortly after, so the flow ends somewhere
      // useful. The new password is required - the old one no longer works.
      setTimeout(() => navigate('/login', { replace: true }), 2500);
    } catch (error) {
      setStatus({ variant: 'error', message: error.message });
      setForm({ newPassword: '', confirmPassword: '' });
    } finally {
      setLoading(false);
    }
  };

  // A missing token means the link was mistyped or truncated.
  if (!token) {
    return (
      <AuthLayout
        audience="customer"
        eyebrow="Account help"
        title="Reset your password"
        subtitle="This page needs the link from your reset email."
        footer={
          <div className="auth-alt-row">
            <Link className="auth-link" to="/forgot-password">
              Request a new link
            </Link>
            <Link className="auth-link" to="/login">
              Back to sign in
            </Link>
          </div>
        }
      >
        <Alert variant="warning">
          No reset token was found in the address. Open the link from your reset
          email exactly as it was sent, or request a new one.
        </Alert>
        <div className="auth-actions" style={{ marginTop: 20 }}>
          <Link className="auth-btn auth-btn-primary" to="/forgot-password">
            Request a new link
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      audience="customer"
      eyebrow="Account help"
      title="Choose a new password"
      subtitle="Reset links are single use and expire shortly after they are sent."
      footer={
        <div className="auth-alt-row">
          <Link className="auth-link" to="/login">
            ← Back to customer sign in
          </Link>
          <Link className="auth-link" to="/forgot-password">
            Request a new link
          </Link>
        </div>
      }
    >
      {status ? <Alert variant={status.variant}>{status.message}</Alert> : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <PasswordInput
          label="New password"
          name="newPassword"
          value={form.newPassword}
          onChange={handleChange}
          error={errors.newPassword}
          required
          autoComplete="new-password"
          hint={PASSWORD_RULE_TEXT}
          strength={passwordStrength(form.newPassword)}
          autoFocus
        />

        <PasswordInput
          label="Confirm new password"
          name="confirmPassword"
          value={form.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          required
          autoComplete="new-password"
        />

        <AuthLoadingButton loading={loading} loadingText="Saving…">
          Set new password
        </AuthLoadingButton>
      </form>

      <Alert variant="info">
        For your security, setting a new password signs you out everywhere. You
        will need to sign in again on every device.
      </Alert>
    </AuthLayout>
  );
}

/**
 * Entry point for /forgot-password.
 *
 * When a token is present in the URL the user is actually at step two, so the
 * reset form is rendered. This also makes the emailed link work if it points at
 * /forgot-password?token=... rather than /reset-password?token=...
 */
export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const hasToken = Boolean(searchParams.get('token'));
  return hasToken ? <ChooseNewPassword /> : <RequestResetLink />;
}

export { ChooseNewPassword };


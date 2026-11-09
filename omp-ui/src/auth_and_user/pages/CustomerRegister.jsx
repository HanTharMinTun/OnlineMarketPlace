import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import AuthLayout from '../components/AuthLayout.jsx';
import AuthFormInput from '../components/AuthFormInput.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import AuthLoadingButton from '../components/AuthLoadingButton.jsx';
import Alert from '../components/Alert.jsx';
import authService from '../services/authService.js';
import {
  MAX,
  PASSWORD_RULE_TEXT,
  passwordStrength,
  validateConfirmPassword,
  validateEmail,
  validatePassword,
  validatePhone,
  validateRequiredName,
} from '../utils/validation.js';
import { validateAndFocus } from '../utils/formHelpers.js';

const INITIAL = {
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

export default function CustomerRegister() {
  const navigate = useNavigate();

  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = passwordStrength(form.password);

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
      name: () => validateRequiredName(form.name),
      email: () => validateEmail(form.email),
      phone: () => validatePhone(form.phone),
      password: () => validatePassword(form.password),
      confirmPassword: () => validateConfirmPassword(form.password, form.confirmPassword),
    });
    setErrors(nextErrors);
    if (!isValid) return;

    setLoading(true);
    setServerError('');
    try {
      // Only the fields the backend accepts. No id / role / password_hash /
      // status is ever sent, and there is no role selector on this form.
      await authService.registerCustomer({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });

      // The backend returns 201 with the user object but NO token, so the user
      // must sign in explicitly. Never auto-authenticate from registration.
      setForm(INITIAL);
      setSuccess(
        'Your customer account was created successfully. Redirecting you to sign in…',
      );
      setTimeout(() => navigate('/login', { replace: true }), 1600);
    } catch (error) {
      setServerError(error.message);
      setForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      audience="customer"
      eyebrow="Create account"
      title="Join Online Marketplace"
      subtitle="It only takes a minute to start shopping."
      footer={
        <div className="auth-alt-row">
          <span>Already have an account?</span>
          <Link className="auth-link" to="/login">
            Sign in instead
          </Link>
        </div>
      }
    >
      {success ? <Alert variant="success">{success}</Alert> : null}
      {serverError ? <Alert variant="error">{serverError}</Alert> : null}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <AuthFormInput
          label="Full name"
          name="name"
          value={form.name}
          onChange={handleChange}
          error={errors.name}
          required
          autoComplete="name"
          maxLength={MAX.name}
          placeholder="Aung Aung"
          autoFocus
        />

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
          maxLength={MAX.email}
          placeholder="you@example.com"
        />

        <AuthFormInput
          label="Phone number"
          name="phone"
          type="tel"
          value={form.phone}
          onChange={handleChange}
          error={errors.phone}
          optional
          autoComplete="tel"
          inputMode="tel"
          maxLength={MAX.phone}
          placeholder="09xxxxxxxxx"
        />

        <PasswordInput
          label="Password"
          name="password"
          value={form.password}
          onChange={handleChange}
          error={errors.password}
          hint={PASSWORD_RULE_TEXT}
          strength={strength}
          required
          autoComplete="new-password"
        />

        <PasswordInput
          label="Confirm password"
          name="confirmPassword"
          value={form.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
          required
          autoComplete="new-password"
        />

        <AuthLoadingButton loading={loading} loadingText="Creating account…">
          Create account
        </AuthLoadingButton>
      </form>
    </AuthLayout>
  );
}

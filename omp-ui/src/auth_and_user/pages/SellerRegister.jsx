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
  validateMaxLength,
  validatePassword,
  validatePhone,
  validateRequiredName,
} from '../utils/validation.js';
import { validateAndFocus } from '../utils/formHelpers.js';

const INITIAL = {
  name: '',
  email: '',
  phone: '',
  shop_name: '',
  address: '',
  password: '',
  confirmPassword: '',
  id_card: '',
  kpay_phone: '',
  bank_acc: '',
};

export default function SellerRegister() {
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
      phone: () => validatePhone(form.phone, { required: true }),
      shop_name: () => validateMaxLength(form.shop_name, MAX.shopName, 'Shop name'),
      address: () => validateMaxLength(form.address, MAX.address, 'Shop address'),
      id_card: () => validateMaxLength(form.id_card, MAX.idCard, 'ID card'),
      kpay_phone: () => validatePhone(form.kpay_phone),
      bank_acc: () => validateMaxLength(form.bank_acc, MAX.bankAcc, 'Bank account'),
      password: () => validatePassword(form.password),
      confirmPassword: () => validateConfirmPassword(form.password, form.confirmPassword),
    });
    setErrors(nextErrors);
    if (!isValid) return;

    setLoading(true);
    setServerError('');
    try {
      // `status` is deliberately NOT sent: the table default ('pending') applies
      // and the frontend can never self-approve a seller.
      await authService.registerSeller({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        shop_name: form.shop_name.trim(),
        address: form.address.trim(),
        password: form.password,
        id_card: form.id_card.trim(),
        kpay_phone: form.kpay_phone.trim(),
        bank_acc: form.bank_acc.trim(),
      });

      setForm(INITIAL);
      setSuccess(
        'Your seller account has been registered successfully. Your shop is pending admin approval. ' +
          'You will be able to access seller features once your account is approved.',
      );
      setTimeout(() => navigate('/seller/login', { replace: true }), 3000);
    } catch (error) {
      setServerError(error.message);
      setForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      audience="seller"
      eyebrow="Become a seller"
      title="Open your shop"
      subtitle="Register your shop and start selling after a quick admin review."
      footer={
        <>
          <div className="auth-alt-row">
            <span>Already selling with us?</span>
            <Link className="auth-link" to="/seller/login">
              Seller sign in
            </Link>
          </div>
          <div className="auth-alt-row">
            <Link className="auth-link" to="/register">
              ← Customer registration
            </Link>
          </div>
        </>
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
          placeholder="Shop owner name"
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
          placeholder="shop@example.com"
        />

        <AuthFormInput
          label="Phone number"
          name="phone"
          type="tel"
          value={form.phone}
          onChange={handleChange}
          error={errors.phone}
          required
          autoComplete="tel"
          inputMode="tel"
          maxLength={MAX.phone}
          placeholder="09xxxxxxxxx"
        />

        <div className="auth-grid-2">
          <AuthFormInput
            label="Shop name"
            name="shop_name"
            value={form.shop_name}
            onChange={handleChange}
            error={errors.shop_name}
            optional
            maxLength={MAX.shopName}
            placeholder="My Shop"
          />
          <AuthFormInput
            label="Shop address"
            name="address"
            value={form.address}
            onChange={handleChange}
            error={errors.address}
            optional
            maxLength={MAX.address}
            placeholder="City / township"
          />
        </div>

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

        <details>
          <summary className="auth-hint" style={{ cursor: 'pointer' }}>
            Payout / verification details (optional)
          </summary>
          <div className="auth-form" style={{ marginTop: 14 }}>
            <AuthFormInput
              label="KBZ Pay phone"
              name="kpay_phone"
              type="tel"
              value={form.kpay_phone}
              onChange={handleChange}
              error={errors.kpay_phone}
              optional
              inputMode="tel"
              maxLength={MAX.kpayPhone}
              placeholder="09xxxxxxxxx"
            />
            <AuthFormInput
              label="Bank account"
              name="bank_acc"
              value={form.bank_acc}
              onChange={handleChange}
              error={errors.bank_acc}
              optional
              maxLength={MAX.bankAcc}
              placeholder="Bank name / account number"
            />
            <AuthFormInput
              label="ID card"
              name="id_card"
              value={form.id_card}
              onChange={handleChange}
              error={errors.id_card}
              optional
              maxLength={MAX.idCard}
              placeholder="National ID number"
            />
          </div>
        </details>

        <Alert variant="info">
          Seller accounts are reviewed by an administrator. You will be able to
          sign in and reach your dashboard once your shop is approved.
        </Alert>

        <AuthLoadingButton loading={loading} loadingText="Submitting…">
          Register shop
        </AuthLoadingButton>
      </form>
    </AuthLayout>
  );
}

// Shared, client-side validation helpers.
//
// These intentionally MIRROR the backend rules in
// `omp-backend/src/auth_and_user/auth.js` so users get fast feedback.
// The backend remains the single source of truth: it re-validates everything.

export const MAX = {
  name: 100,
  email: 255,
  phone: 20,
  shopName: 20, // seller.shop_name varchar(20)
  address: 50, // seller.address   varchar(50)
  idCard: 50, // seller.id_card   varchar(50)
  kpayPhone: 50,
  bankAcc: 50, // seller.bank_acc  varchar(50)
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Same policy as the backend: >= 8 chars, at least one letter and one number.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const PHONE_REGEX = /^[0-9+\-\s()]{6,20}$/;

export const PASSWORD_RULE_TEXT =
  'At least 8 characters, including both letters and numbers.';

export function isRequired(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

export function validateEmail(email) {
  const value = typeof email === 'string' ? email.trim() : '';
  if (!value) return 'Email is required.';
  if (value.length > MAX.email) return 'Email is too long.';
  if (!EMAIL_REGEX.test(value)) return 'Enter a valid email address.';
  return null;
}

export function validateRequiredName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) return 'Full name is required.';
  if (value.length > MAX.name) return `Full name must be ${MAX.name} characters or fewer.`;
  return null;
}

export function validatePhone(phone, { required = false } = {}) {
  const value = typeof phone === 'string' ? phone.trim() : '';
  if (!value) return required ? 'Phone number is required.' : null;
  if (!PHONE_REGEX.test(value)) return 'Enter a valid phone number (6-20 digits).';
  return null;
}

export function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (!PASSWORD_REGEX.test(password)) return PASSWORD_RULE_TEXT;
  return null;
}

export function validateConfirmPassword(password, confirmPassword) {
  if (!confirmPassword) return 'Please confirm your password.';
  if (password !== confirmPassword) return 'Passwords do not match.';
  return null;
}

export function validateMaxLength(value, max, label) {
  const raw = typeof value === 'string' ? value : '';
  if (raw.trim().length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

/**
 * Password strength score from 0 (empty) to 4 (strong), plus a label.
 * Used only for user feedback, never for security decisions.
 */
export function passwordStrength(password) {
  const value = typeof password === 'string' ? password : '';
  if (!value) return { score: 0, label: 'Enter a password' };

  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Za-z]/.test(value) && /\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;
  if (!PASSWORD_REGEX.test(value)) score = Math.min(score, 1);

  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score] };
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import AuthFormInput from '../components/AuthFormInput.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import AuthLoadingButton from '../components/AuthLoadingButton.jsx';
import Alert from '../components/Alert.jsx';
import authService from '../services/authService.js';
import { useAuth } from '../context/authContext.js';
import { ROLES, homePathForRole } from '../utils/roles.js';
import {
  MAX,
  PASSWORD_RULE_TEXT,
  passwordStrength,
  validateConfirmPassword,
  validateMaxLength,
  validatePassword,
  validatePhone,
  validateRequiredName,
} from '../utils/validation.js';
import { validateAndFocus } from '../utils/formHelpers.js';
import '../styles/auth.css';

const INITIAL_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };

function StatusBadge({ status }) {
  if (!status) return null;
  return <span className={`auth-badge auth-badge-${status}`}>{status}</span>;
}

/** Build the editable form values from the verified user object. */
function seedProfile(user) {
  return {
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    shop_name: user?.shop_name ?? '',
    address: user?.address ?? '',
  };
}

export default function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(() => seedProfile(user));
  const [profileErrors, setProfileErrors] = useState({});
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState(INITIAL_PASSWORDS);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [loggingOut, setLoggingOut] = useState(false);

  const isCustomer = user?.role === ROLES.CUSTOMER;
  const isSeller = user?.role === ROLES.SELLER;
  const isAdmin = user?.role === ROLES.ADMIN;
  const canEditProfile = isCustomer || isSeller;
  // The backend refuses profile edits for suspended sellers (requireActiveSeller).
  const sellerEditable = isSeller && user?.status !== 'suspended';

  // Re-seed the form when a DIFFERENT account becomes active (e.g. after a new
  // sign-in). Adjusting state during render is React's documented alternative
  // to a setState-in-effect, and it deliberately does not re-run when
  // refreshUser() merely returns updated values for the same account, so
  // in-progress edits are never clobbered.
  const [seededUserId, setSeededUserId] = useState(user?.id ?? null);
  if ((user?.id ?? null) !== seededUserId) {
    setSeededUserId(user?.id ?? null);
    setProfile(seedProfile(user));
  }

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
    if (profileErrors[name]) setProfileErrors((prev) => ({ ...prev, [name]: undefined }));
    if (profileError) setProfileError('');
    if (profileMessage) setProfileMessage('');
  };

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    if (savingProfile) return;

    const rules = {
      name: () => validateRequiredName(profile.name),
      phone: () => validatePhone(profile.phone),
    };
    if (isSeller) {
      rules.shop_name = () => validateMaxLength(profile.shop_name, MAX.shopName, 'Shop name');
      rules.address = () => validateMaxLength(profile.address, MAX.address, 'Shop address');
    }

    const { errors: nextErrors, isValid } = validateAndFocus(rules);
    setProfileErrors(nextErrors);
    if (!isValid) return;

    setSavingProfile(true);
    setProfileError('');
    setProfileMessage('');
    try {
      // Only the fields the backend allows are forwarded. `role` and `status`
      // are never sent - the backend would ignore them anyway, and the UI has
      // no control for them.
      const payload = { name: profile.name.trim(), phone: profile.phone.trim() };
      if (isSeller) {
        payload.shop_name = profile.shop_name.trim();
        payload.address = profile.address.trim();
      }

      const data = isSeller
        ? await authService.updateSellerProfile(payload)
        : await authService.updateCustomerProfile(payload);

      // Re-read /api/auth/me so the UI reflects what the server actually stored.
      await refreshUser();
      setProfileMessage(data?.message || 'Profile updated successfully.');
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = (event) => {
    const { name, value } = event.target;
    setPasswords((prev) => ({ ...prev, [name]: value }));
    if (passwordErrors[name]) setPasswordErrors((prev) => ({ ...prev, [name]: undefined }));
    if (passwordError) setPasswordError('');
    if (passwordMessage) setPasswordMessage('');
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    if (savingPassword) return;

    const { errors: nextErrors, isValid } = validateAndFocus({
      currentPassword: () =>
        passwords.currentPassword ? null : 'Current password is required.',
      newPassword: () => validatePassword(passwords.newPassword),
      confirmPassword: () =>
        validateConfirmPassword(passwords.newPassword, passwords.confirmPassword),
    });
    setPasswordErrors(nextErrors);
    if (!isValid) return;

    if (passwords.currentPassword === passwords.newPassword) {
      setPasswordErrors({
        newPassword: 'New password must be different from the current password.',
      });
      return;
    }

    setSavingPassword(true);
    setPasswordError('');
    setPasswordMessage('');
    try {
      const data = await authService.changePassword({
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      // Never keep password material in state longer than necessary.
      setPasswords(INITIAL_PASSWORDS);
      // The backend invalidated every session for this account and issued a
      // replacement token for this device (stored by authService). Re-reading
      // /me syncs the context so this tab stays signed in with the new token.
      await refreshUser();
      setPasswordMessage(data?.message || 'Password changed successfully.');
    } catch (error) {
      setPasswordError(error.message);
      setPasswords(INITIAL_PASSWORDS);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      navigate('/login', { replace: true });
    }
  };

  if (!user) return null; // ProtectedRoute guarantees a user; this is just a guard

  return (
    <div className="auth-page">
      <div className="auth-page-inner">
        <div className="auth-panel-head">
          <div>
            <h2 style={{ marginBottom: 4 }}>My account</h2>
            <span className="auth-badge auth-badge-role">{user.role}</span>{' '}
            {isSeller ? <StatusBadge status={user.status} /> : null}
          </div>
          <div className="auth-actions">
            <Link className="auth-btn auth-btn-secondary" to={homePathForRole(user.role)}>
              {isAdmin ? 'Admin dashboard' : isSeller ? 'Seller dashboard' : 'Continue shopping'}
            </Link>
            <button
              type="button"
              className="auth-btn auth-btn-secondary"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>

        {isSeller && user.status === 'pending' ? (
          <Alert variant="warning">
            Your shop is pending admin approval. Seller features stay locked until
            an administrator approves your account.
          </Alert>
        ) : null}

        {isSeller && user.status === 'suspended' ? (
          <Alert variant="error">
            Your seller account is suspended. Contact support to restore access.
          </Alert>
        ) : null}

        <section className="auth-panel">
          <h2>Account details</h2>
          <p className="auth-panel-sub">
            Your role and account status are managed by the marketplace and cannot
            be changed here.
          </p>

          <dl className="auth-dl">
            <div>
              <dt>Name</dt>
              <dd>{user.name || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email || '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{user.phone || '—'}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user.role}</dd>
            </div>
            {isSeller ? (
              <>
                <div>
                  <dt>Shop name</dt>
                  <dd>{user.shop_name || '—'}</dd>
                </div>
                <div>
                  <dt>Shop address</dt>
                  <dd>{user.address || '—'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge status={user.status} />
                  </dd>
                </div>
              </>
            ) : null}
            {user.created_at ? (
              <div>
                <dt>Member since</dt>
                <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
              </div>
            ) : null}
          </dl>

          {isAdmin ? (
            <Alert variant="info">
              Administrator details are read-only. Admin accounts are provisioned
              directly in the database by the developer.
            </Alert>
          ) : null}
        </section>

        {canEditProfile ? (
          <section className="auth-panel">
            <h2>Edit profile</h2>
            <p className="auth-panel-sub">
              {isSeller
                ? 'Update your contact details and shop information.'
                : 'Update your name and phone number.'}
            </p>

            {!sellerEditable ? (
              <Alert variant="error">
                Profile editing is disabled while your seller account is suspended.
              </Alert>
            ) : null}

            {profileMessage ? <Alert variant="success">{profileMessage}</Alert> : null}
            {profileError ? <Alert variant="error">{profileError}</Alert> : null}

            <form className="auth-form" onSubmit={handleProfileSubmit} noValidate>
              <AuthFormInput
                label="Full name"
                name="name"
                value={profile.name}
                onChange={handleProfileChange}
                error={profileErrors.name}
                required
                disabled={!sellerEditable}
                maxLength={MAX.name}
                autoComplete="name"
              />

              <AuthFormInput
                label="Phone number"
                name="phone"
                type="tel"
                value={profile.phone}
                onChange={handleProfileChange}
                error={profileErrors.phone}
                optional
                disabled={!sellerEditable}
                inputMode="tel"
                maxLength={MAX.phone}
                autoComplete="tel"
              />

              {isSeller ? (
                <div className="auth-grid-2">
                  <AuthFormInput
                    label="Shop name"
                    name="shop_name"
                    value={profile.shop_name}
                    onChange={handleProfileChange}
                    error={profileErrors.shop_name}
                    optional
                    disabled={!sellerEditable}
                    maxLength={MAX.shopName}
                  />
                  <AuthFormInput
                    label="Shop address"
                    name="address"
                    value={profile.address}
                    onChange={handleProfileChange}
                    error={profileErrors.address}
                    optional
                    disabled={!sellerEditable}
                    maxLength={MAX.address}
                  />
                </div>
              ) : null}

              <AuthLoadingButton
                loading={savingProfile}
                loadingText="Saving…"
                disabled={!sellerEditable}
              >
                Save changes
              </AuthLoadingButton>
            </form>
          </section>
        ) : null}

        {!isAdmin ? (
          <section className="auth-panel">
            <h2>Change password</h2>
            <p className="auth-panel-sub">
              Choose a strong password you do not use anywhere else.
            </p>

            {passwordMessage ? <Alert variant="success">{passwordMessage}</Alert> : null}
            {passwordError ? <Alert variant="error">{passwordError}</Alert> : null}

            <form className="auth-form" onSubmit={handlePasswordSubmit} noValidate>
              <PasswordInput
                label="Current password"
                name="currentPassword"
                value={passwords.currentPassword}
                onChange={handlePasswordChange}
                error={passwordErrors.currentPassword}
                required
                autoComplete="current-password"
              />

              <PasswordInput
                label="New password"
                name="newPassword"
                value={passwords.newPassword}
                onChange={handlePasswordChange}
                error={passwordErrors.newPassword}
                hint={PASSWORD_RULE_TEXT}
                strength={passwordStrength(passwords.newPassword)}
                required
                autoComplete="new-password"
              />

              <PasswordInput
                label="Confirm new password"
                name="confirmPassword"
                value={passwords.confirmPassword}
                onChange={handlePasswordChange}
                error={passwordErrors.confirmPassword}
                required
                autoComplete="new-password"
              />

              <AuthLoadingButton loading={savingPassword} loadingText="Updating…">
                Update password
              </AuthLoadingButton>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  );
}

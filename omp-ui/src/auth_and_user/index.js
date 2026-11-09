// Public entry point for the authentication / user-management feature.
// Import from here (not from deep paths) so the module stays easy to move:
//   import { AuthProvider, ProtectedRoute, ROLES, useAuth } from './auth_and_user'
//
// Importing the stylesheet here guarantees the auth styles are bundled even if
// only a single page from this module is rendered.

import './styles/auth.css';

// Context
export { AuthProvider } from './context/AuthContext.jsx';
export { AuthContext, useAuth } from './context/authContext.js';

// Components
export { default as Alert } from './components/Alert.jsx';
export { default as AuthLayout } from './components/AuthLayout.jsx';
export { default as AuthFormInput } from './components/AuthFormInput.jsx';
export { default as PasswordInput } from './components/PasswordInput.jsx';
export { default as AuthLoadingButton } from './components/AuthLoadingButton.jsx';
export { default as ProtectedRoute } from './components/ProtectedRoute.jsx';

// Pages
export { default as CustomerLogin } from './pages/CustomerLogin.jsx';
export { default as CustomerRegister } from './pages/CustomerRegister.jsx';
export { default as SellerLogin } from './pages/SellerLogin.jsx';
export { default as SellerRegister } from './pages/SellerRegister.jsx';
export { default as AdminLogin } from './pages/AdminLogin.jsx';
export { default as ForgotPassword } from './pages/ForgotPassword.jsx';
export { default as ResetPassword } from './pages/ResetPassword.jsx';
export { default as ProfilePage } from './pages/ProfilePage.jsx';
export { default as SellerDashboard } from './pages/SellerDashboard.jsx';
export { default as AdminDashboard } from './pages/AdminDashboard.jsx';

// Service + helpers
export { default as authService, ApiError, API_BASE_URL } from './services/authService.js';
export * from './utils/roles.js';
export * from './utils/validation.js';
export * from './utils/formHelpers.js';

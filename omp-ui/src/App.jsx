import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { ROLES } from './auth_and_user/utils/roles.js';
import { AuthProvider } from './auth_and_user/context/AuthContext.jsx';
import ProtectedRoute from './auth_and_user/components/ProtectedRoute.jsx';
import AuthNav from './auth_and_user/components/AuthNav.jsx';
import CustomerLogin from './auth_and_user/pages/CustomerLogin.jsx';
import CustomerRegister from './auth_and_user/pages/CustomerRegister.jsx';
import SellerLogin from './auth_and_user/pages/SellerLogin.jsx';
import SellerRegister from './auth_and_user/pages/SellerRegister.jsx';
import AdminLogin from './auth_and_user/pages/AdminLogin.jsx';
import ForgotPassword from './auth_and_user/pages/ForgotPassword.jsx';
import ResetPassword from './auth_and_user/pages/ResetPassword.jsx';
import ProfilePage from './auth_and_user/pages/ProfilePage.jsx';
import SellerDashboard from './auth_and_user/pages/SellerDashboard.jsx';
import AdminDashboard from './auth_and_user/pages/AdminDashboard.jsx';
import Home from './pages/Home.jsx';
import NotFound from './pages/NotFound.jsx';

// Route protection happens in TWO independent places and both are required:
//   1. <ProtectedRoute> below  -> user experience (no dead-end screens).
//   2. the backend middleware  -> the actual security boundary.
// Client-side checks can always be bypassed with devtools, so they are never
// treated as authorization.
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AuthNav />
        <Routes>
          {/* Existing marketplace entry point (starter content preserved) */}
          <Route path="/" element={<Home />} />

          {/* Customer */}
          <Route path="/login" element={<CustomerLogin />} />
          <Route path="/register" element={<CustomerRegister />} />

          {/* Seller */}
          <Route path="/seller/login" element={<SellerLogin />} />
          <Route path="/seller/register" element={<SellerRegister />} />
          <Route
            path="/seller/dashboard"
            element={
              <ProtectedRoute allowedRoles={[ROLES.SELLER]}>
                <SellerDashboard />
              </ProtectedRoute>
            }
          />

          {/* Admin - sign in only. There is deliberately NO admin register
              route: admin accounts are created in PostgreSQL by the developer. */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Shared */}
          <Route path="/forgot-password" element={<ForgotPassword />} />
          {/* The link from the reset email lands here with ?token=... .
              /forgot-password?token=... is handled too (see ForgotPassword). */}
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute
                allowedRoles={[ROLES.CUSTOMER, ROLES.SELLER, ROLES.ADMIN]}
              >
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Convenience aliases */}
          <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
          <Route path="/seller" element={<Navigate to="/seller/login" replace />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;


import { ChooseNewPassword } from './ForgotPassword.jsx';

// Route entry point for /reset-password?token=...
//
// The reset screen itself lives next to the "forgot password" screen because
// the two steps share their copy and validation; this thin wrapper just gives
// the route its own page component (and its own entry in the module's public
// API). The token is read from the query string by ChooseNewPassword.
export default function ResetPassword() {
  return <ChooseNewPassword />;
}

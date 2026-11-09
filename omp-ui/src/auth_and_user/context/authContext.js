// The React context object + the `useAuth` hook live in this plain .js file so
// that `AuthContext.jsx` only exports a component (keeps the
// react/only-export-components lint rule happy).
import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

/** Access the authentication state. Must be used inside <AuthProvider>. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth() must be used inside an <AuthProvider>.');
  }
  return context;
}

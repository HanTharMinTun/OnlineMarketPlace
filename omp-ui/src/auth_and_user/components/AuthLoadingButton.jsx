/**
 * Submit button that shows a spinner and blocks duplicate submissions while a
 * request is in flight.
 */
export default function AuthLoadingButton({
  children,
  loading = false,
  loadingText = 'Please wait…',
  disabled = false,
  variant = 'primary',
  type = 'submit',
  className = '',
  onClick,
}) {
  return (
    <button
      type={type}
      className={`auth-btn auth-btn-${variant} auth-btn-block ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={onClick}
    >
      {loading ? (
        <>
          <span className={`auth-spinner ${variant === 'secondary' ? 'auth-spinner-dark' : ''}`} />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

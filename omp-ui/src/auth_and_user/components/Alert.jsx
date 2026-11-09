// Small inline feedback box used by every auth page.
// `role="alert"` for errors so screen readers announce them immediately.

const ICONS = {
  success: '✓',
  error: '!',
  warning: '!',
  info: 'i',
};

export default function Alert({ variant = 'info', children, id }) {
  if (!children) return null;
  const isError = variant === 'error';
  return (
    <div
      className={`auth-alert auth-alert-${variant}`}
      id={id}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      <span aria-hidden="true">{ICONS[variant] || ICONS.info}</span>
      <span>{children}</span>
    </div>
  );
}

import { useId, useState } from 'react';

/**
 * Password field with a show/hide toggle and an optional strength meter.
 * The plain password only ever lives in the parent form state for the duration
 * of the request; it is never persisted or logged.
 */
export default function PasswordInput({
  label = 'Password',
  name,
  value,
  onChange,
  onBlur,
  error,
  hint,
  required = false,
  optional = false,
  disabled = false,
  autoComplete = 'current-password',
  placeholder = '••••••••',
  strength = null, // { score: 0-4, label: string } from passwordStrength()
  autoFocus = false,
}) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = `auth-${name}-${generatedId}`;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="auth-field">
      <label htmlFor={inputId}>
        {label}
        {required && !optional ? <span aria-hidden="true"> *</span> : null}
        {optional ? <span className="auth-optional">optional</span> : null}
      </label>

      <div className="auth-input-wrap">
        <input
          id={inputId}
          name={name}
          type={visible ? 'text' : 'password'}
          className={`auth-input with-trailing ${error ? 'has-error' : ''}`.trim()}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
        />
        <button
          type="button"
          className="auth-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={0}
        >
          <span aria-hidden="true">{visible ? '🙈' : '👁'}</span>
        </button>
      </div>

      {strength ? (
        <div className="auth-strength" aria-hidden="true">
          <div className="auth-strength-bars">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={strength.score >= step ? `on-${strength.score}` : ''}
              />
            ))}
          </div>
          <span className="auth-strength-label">
            Password strength: {strength.label}
          </span>
        </div>
      ) : null}

      {hint && !error ? (
        <span className="auth-hint" id={hintId}>
          {hint}
        </span>
      ) : null}

      {error ? (
        <span className="auth-error auth-field-error" id={errorId}>
          <span aria-hidden="true">⚠</span>
          {error}
        </span>
      ) : null}
    </div>
  );
}

import { useId } from 'react';

/**
 * Labelled text input with inline validation messaging.
 * Keeps every auth form accessible: the label is always linked to the control
 * and errors are exposed through aria-describedby + aria-invalid.
 */
export default function AuthFormInput({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  hint,
  required = false,
  optional = false,
  disabled = false,
  autoComplete,
  placeholder,
  inputMode,
  maxLength,
  autoFocus = false,
  trailing = null, // e.g. the show/hide password toggle
  className = '',
}) {
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
          type={type}
          className={`auth-input ${error ? 'has-error' : ''} ${
            trailing ? 'with-trailing' : ''
          } ${className}`.trim()}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
        />
        {trailing}
      </div>

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

// Small form helpers shared by the auth pages (keeps each page focused on its
// own fields instead of repeating validation plumbing).

/**
 * Run a map of { field: () => errorMessageOrNull } and collect the messages.
 * @returns {{ errors: Record<string,string>, firstInvalid: string|null }}
 */
export function runValidators(rules) {
  const errors = {};
  for (const [field, validator] of Object.entries(rules)) {
    const message = typeof validator === 'function' ? validator() : validator;
    if (message) errors[field] = message;
  }
  const firstInvalid = Object.keys(errors)[0] || null;
  return { errors, firstInvalid };
}

/** Move keyboard focus to the named field (no-op if it is not on screen). */
export function focusField(name) {
  if (!name || typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const element = document.querySelector(`[name="${name}"]`);
    if (element && typeof element.focus === 'function') element.focus();
  });
}

/** Validate on submit and focus the first offending field. */
export function validateAndFocus(rules) {
  const { errors, firstInvalid } = runValidators(rules);
  if (firstInvalid) focusField(firstInvalid);
  return { errors, firstInvalid, isValid: !firstInvalid };
}

export default { runValidators, focusField, validateAndFocus };

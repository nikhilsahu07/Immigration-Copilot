/**
 * Compute accessible name from various label sources
 * 
 * Priority order (following ARIA spec):
 * 1. aria-label (highest priority)
 * 2. labelText (from <label> element)
 * 3. aria-labelledby (resolve element text)
 * 4. placeholder
 * 5. name attribute
 * 6. id attribute
 * 7. Empty string (fallback)
 */
export function computeAccessibleName(field: {
  labelText?: string | null;
  ariaLabel?: string | null;
  ariaLabelledBy?: string | null;
  placeholder?: string | null;
  id?: string | null;
  name?: string | null;
}): string {
  // Priority 1: aria-label
  if (field.ariaLabel && field.ariaLabel.trim().length > 0) {
    return field.ariaLabel.trim();
  }

  // Priority 2: labelText (from <label> element)
  if (field.labelText && field.labelText.trim().length > 0) {
    return field.labelText.trim();
  }

  // Priority 3: aria-labelledby (would need DOM query, but we'll use the resolved text if available)
  // Note: In practice, aria-labelledby is resolved browser-side during extraction
  // If it's provided as resolved text, it would be in labelText already
  // This is a placeholder for future enhancement if needed

  // Priority 4: placeholder
  if (field.placeholder && field.placeholder.trim().length > 0) {
    return field.placeholder.trim();
  }

  // Priority 5: name attribute
  if (field.name && field.name.trim().length > 0) {
    return field.name.trim();
  }

  // Priority 6: id attribute
  if (field.id && field.id.trim().length > 0) {
    return field.id.trim();
  }

  // Priority 7: Empty string fallback
  return '';
}

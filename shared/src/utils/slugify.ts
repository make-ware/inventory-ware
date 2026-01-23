export function slugify(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/[^A-Za-z0-9- ]+/g, '-') // Allow A-Z, a-z, 0-9, hyphen, and space. Replace others with hyphen.
    .replace(/[- ]+/g, (m) => (m.includes(' ') ? ' ' : '-')) // Collapse multiple spaces/hyphens
    .replace(/^[- ]+|[- ]+$/g, ''); // Remove leading/trailing separators
}

/**
 * Formats a slug back to a human-readable label (Title Case)
 */
export function formatCategoryLabel(slug: string): string {
  if (!slug) return '';
  return slug; // Return as-is, since it now allows spaces and hyphens naturally
}

/**
 * Simple HTML/XSS sanitization for free-text inputs.
 * Strips dangerous HTML tags and attributes, preserving plain text.
 */

// Strip any HTML tags entirely (convert to plain text)
export function sanitizeText(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

// Sanitize and limit length
export function sanitizeAndLimit(input: string, maxLength: number): string {
  return sanitizeText(input).slice(0, maxLength);
}

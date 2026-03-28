/**
 * HTML/XSS sanitization for free-text inputs.
 * Strips dangerous HTML tags, attributes, and encoded bypass vectors.
 */

/**
 * Decode common HTML entities that attackers use to bypass simple regex filters.
 * e.g. &#106;avascript: → javascript:
 */
function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/** Strip any HTML tags and dangerous patterns, preserving plain text */
export function sanitizeText(input: string): string {
  // First decode HTML entities to catch encoded attacks
  let text = decodeHtmlEntities(input);

  return text
    // Remove script tags (including nested/malformed)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '')
    // Remove all remaining HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove javascript: protocol (with optional whitespace/null bytes)
    .replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '')
    // Remove vbscript: protocol
    .replace(/v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '')
    // Remove data: URIs (can execute scripts)
    .replace(/data\s*:[^,]*;base64/gi, '')
    // Remove event handler attributes (onclick=, onerror=, onload=, etc.)
    .replace(/on\w+\s*=/gi, '')
    // Remove expression() CSS (IE XSS vector)
    .replace(/expression\s*\(/gi, '')
    .trim();
}

/** Sanitize and limit length */
export function sanitizeAndLimit(input: string, maxLength: number): string {
  return sanitizeText(input).slice(0, maxLength);
}

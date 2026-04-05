/**
 * HTML/XSS sanitization for free-text inputs.
 *
 * Strategy:
 *  1. Iteratively decode HTML entities until the string stops changing
 *     (defeats nested-encoding attacks like &#106;&#97;&#118;ascript:).
 *  2. Strip all HTML tags and dangerous protocol/attribute patterns.
 *
 * This is intentionally conservative — it strips rather than allows.
 * For rich-text content use a dedicated allow-list library (DOMPurify
 * on the client, sanitize-html on the server).
 */

const ENTITY_RE = /&#x([0-9a-fA-F]+);?|&#(\d+);?/g;

function decodeEntitiesOnce(input: string): string {
  return input.replace(ENTITY_RE, (_, hex, dec) =>
    String.fromCharCode(hex ? parseInt(hex, 16) : parseInt(dec, 10)),
  );
}

/** Repeatedly decode until no more entities remain (prevents nested encoding). */
function decodeEntitiesDeep(input: string): string {
  let prev = input;
  let next = decodeEntitiesOnce(prev);
  // Max 10 passes — practical limit against deeply nested encoding
  for (let i = 0; i < 10 && next !== prev; i++) {
    prev = next;
    next = decodeEntitiesOnce(prev);
  }
  return next;
}

/** Strip HTML and dangerous patterns from a string, preserving plain text. */
export function sanitizeText(input: string): string {
  // Fully decode before pattern matching so encoded attacks are caught
  let text = decodeEntitiesDeep(input);

  return text
    // Remove complete <script>...</script> blocks first
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Strip javascript: / vbscript: protocols (with any whitespace or null bytes inserted)
    .replace(/j[\s\0]*a[\s\0]*v[\s\0]*a[\s\0]*s[\s\0]*c[\s\0]*r[\s\0]*i[\s\0]*p[\s\0]*t[\s\0]*:/gi, '')
    .replace(/v[\s\0]*b[\s\0]*s[\s\0]*c[\s\0]*r[\s\0]*i[\s\0]*p[\s\0]*t[\s\0]*:/gi, '')
    // Strip data: URIs (can carry base64-encoded scripts)
    .replace(/data[\s\0]*:[\s\0]*[^,]*;[\s\0]*base64/gi, '')
    // Strip inline event handlers (onclick=, onerror=, onload=, …)
    .replace(/\bon\w+[\s\0]*=/gi, '')
    // Strip CSS expression() — historic IE XSS vector
    .replace(/expression[\s\0]*\(/gi, '')
    .trim();
}

/** Sanitize and hard-cap length. */
export function sanitizeAndLimit(input: string, maxLength: number): string {
  return sanitizeText(input).slice(0, maxLength);
}

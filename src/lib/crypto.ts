/**
 * Field-level encryption for sensitive database columns (phone, 2FA secrets).
 *
 * Algorithm : AES-256-GCM (authenticated encryption â€” detects tampering)
 * Key source : FIELD_ENCRYPTION_KEY env var (64-char hex = 32 bytes)
 *
 * Ciphertext format: <iv_b64>:<authTag_b64>:<ciphertext_b64>
 * This format is self-contained â€” every encrypted value carries its own IV.
 *
 * Backwards-compatibility: if a stored value doesn't match the three-part
 * format it is assumed to be a legacy plaintext value and returned as-is.
 * This allows safe incremental migration of existing data.
 *
 * Setup:
 *   Generate a key:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   Add to .env:     FIELD_ENCRYPTION_KEY=<64-char hex>
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 16;
const TAG_BYTES = 16;

// Base64 length for N raw bytes = ceil(N / 3) * 4
const IV_B64_LEN = Math.ceil(IV_BYTES / 3) * 4; // 24
const TAG_B64_LEN = Math.ceil(TAG_BYTES / 3) * 4; // 24
// Strict base64 (standard alphabet with required padding).
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const PLACEHOLDER_KEY_RE = /^<64-char hex/i;

/** Returns true only if `value` matches our envelope layout:
 *  base64(iv16):base64(tag16):base64(ciphertext) â€” exact lengths enforced
 *  on iv/tag so legacy plaintext containing two colons is not misparsed. */
function looksLikeCiphertext(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  const [iv, tag, body] = parts;
  if (iv.length !== IV_B64_LEN || tag.length !== TAG_B64_LEN) return false;
  if (body.length === 0) return false;
  return BASE64_RE.test(iv) && BASE64_RE.test(tag) && BASE64_RE.test(body);
}

function getKey(): Buffer {
  const hex = process.env.FIELD_ENCRYPTION_KEY;
  const isPlaceholder = !!hex && PLACEHOLDER_KEY_RE.test(hex.trim());

  if (!hex || isPlaceholder) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FIELD_ENCRYPTION_KEY is required in production. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    // Development fallback â€” zero key, logged as a clear warning.
    // Treat the documented placeholder as unset so local setups keep working.
    logger.warn('[crypto] FIELD_ENCRYPTION_KEY not set or placeholder â€” using insecure dev key. Set a real value before deploying.');
    return Buffer.alloc(32, 0);
  }

  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FIELD_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).');
    }
    logger.warn('[crypto] FIELD_ENCRYPTION_KEY is invalid â€” using insecure dev key. Set a real value before deploying.');
    return Buffer.alloc(32, 0);
  }
  return buf;
}

/** Encrypt a UTF-8 string. Returns a base64-encoded ciphertext envelope. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${body.toString('base64')}`;
}

/** Decrypt a value produced by encrypt(). Returns the original plaintext.
 *  If the value is not in the expected envelope format it is returned
 *  unchanged (backwards-compatibility for pre-encryption rows). */
export function decrypt(value: string): string {
  if (!looksLikeCiphertext(value)) {
    // Legacy plaintext â€” return as-is
    return value;
  }
  const [ivB64, tagB64, bodyB64] = value.split(':');
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const body = Buffer.from(bodyB64, 'base64');

  // Defensive re-check after decode â€” base64 regex above should guarantee this.
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    return value;
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

/** Encrypt a nullable field. null/undefined pass through unchanged. */
export function encryptField(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return encrypt(value);
}

/** Decrypt a nullable field. null/undefined pass through unchanged. */
export function decryptField(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return decrypt(value);
}

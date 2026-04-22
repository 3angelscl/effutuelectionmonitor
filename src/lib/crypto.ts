/**
 * Field-level encryption for sensitive database columns (phone, 2FA secrets).
 *
 * Algorithm: AES-256-GCM
 * Key source: FIELD_ENCRYPTION_KEY env var (64-char hex = 32 bytes)
 *
 * Ciphertext format: <iv_b64>:<authTag_b64>:<ciphertext_b64>
 *
 * Backwards compatibility:
 * - Plaintext values are returned as-is.
 * - Ciphertext created with the old zero-key dev fallback is also accepted.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from './logger';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // Standard for AES-GCM
const LEGACY_IV_BYTES = 16;
const TAG_BYTES = 16;

const IV_B64_LEN = Math.ceil(IV_BYTES / 3) * 4;
const LEGACY_IV_B64_LEN = Math.ceil(LEGACY_IV_BYTES / 3) * 4;
const TAG_B64_LEN = Math.ceil(TAG_BYTES / 3) * 4;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const PLACEHOLDER_KEY_RE = /^<64-char hex/i;
const ZERO_KEY = Buffer.alloc(32, 0);

function looksLikeCiphertext(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  const [iv, tag, body] = parts;
  
  // Accept both standard (12-byte) and legacy (16-byte) IV lengths
  const isValidIvLen = iv.length === IV_B64_LEN || iv.length === LEGACY_IV_B64_LEN;
  if (!isValidIvLen || tag.length !== TAG_B64_LEN) return false;
  
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
    logger.warn('[crypto] FIELD_ENCRYPTION_KEY not set or placeholder - using insecure dev key.');
    return ZERO_KEY;
  }

  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FIELD_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).');
    }
    logger.warn('[crypto] FIELD_ENCRYPTION_KEY is invalid - using insecure dev key.');
    return ZERO_KEY;
  }
  return buf;
}

function decryptWithKey(value: string, key: Buffer): string {
  const [ivB64, tagB64, bodyB64] = value.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const body = Buffer.from(bodyB64, 'base64');

  if ((iv.length !== IV_BYTES && iv.length !== LEGACY_IV_BYTES) || tag.length !== TAG_BYTES) {
    throw new Error('Invalid ciphertext envelope');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
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
 * If the value is not in the expected envelope format it is returned as-is.
 * If the current key fails, we try the legacy zero key once before giving up.
 */
export function decrypt(value: string): string {
  if (!looksLikeCiphertext(value)) {
    return value;
  }

  const key = getKey();

  try {
    return decryptWithKey(value, key);
  } catch {
    if (!key.equals(ZERO_KEY)) {
      try {
        return decryptWithKey(value, ZERO_KEY);
      } catch {
        logger.warn('[crypto] Failed to decrypt field with current and legacy keys; returning empty value.');
      }
    }
    return '';
  }
}

/** Encrypt a nullable field. null/undefined pass through unchanged. */
export function encryptField(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return encrypt(value);
}

/** Decrypt a nullable field. null/undefined pass through unchanged. */
export function decryptField(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  const decrypted = decrypt(value);
  return decrypted === '' ? null : decrypted;
}

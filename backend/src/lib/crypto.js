import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

// Derive a stable 32-byte AES key from ADMIN_SECRET via SHA-256.
// No separate env var needed — the existing secret doubles as the key material.
function getKey() {
  const secret = process.env.ADMIN_SECRET || '';
  if (!secret && !getKey._warned) {
    console.warn('[crypto] ADMIN_SECRET not set — WiFi passwords will use a zero key. Set ADMIN_SECRET in production.');
    getKey._warned = true;
  }
  return createHash('sha256').update(secret).digest(); // always 32 bytes
}

/**
 * Encrypt a plaintext string.
 * Returns "<iv_hex>:<tag_hex>:<ciphertext_hex>" — safe to store as TEXT.
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a value produced by encrypt().
 * Falls back to returning the input unchanged for legacy plaintext rows.
 */
export function decrypt(value) {
  if (!value) return value;
  const parts = value.split(':');
  // Require exactly 3 colon-separated parts where the first is 24 hex chars (12-byte IV)
  // and the second is 32 hex chars (16-byte GCM tag) — otherwise treat as legacy plaintext.
  if (
    parts.length !== 3 ||
    !/^[0-9a-f]{24}$/i.test(parts[0]) ||
    !/^[0-9a-f]{32}$/i.test(parts[1])
  ) return value; // legacy plaintext row
  const [ivHex, tagHex, ctHex] = parts;
  try {
    const key = getKey();
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(ctHex, 'hex')).toString('utf8') + decipher.final('utf8');
  } catch {
    return null; // auth tag mismatch or corrupted ciphertext — signal failure to caller
  }
}

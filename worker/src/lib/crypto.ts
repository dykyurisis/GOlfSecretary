import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Format: "v1:<ivB64>:<tagB64>:<ciphertextB64>". Key is base64 of 32 random bytes.
export function encryptSecret(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('ENC_KEY must be 32 bytes (base64)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptSecret(blob: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('ENC_KEY must be 32 bytes (base64)');
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('unsupported or malformed ciphertext');
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

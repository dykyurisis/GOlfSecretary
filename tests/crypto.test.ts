import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../lib/crypto';

// 32-byte key, base64. (test-only key)
const KEY = Buffer.alloc(32, 7).toString('base64');

describe('crypto', () => {
  it('round-trips a secret', () => {
    const enc = encryptSecret('hunter2', KEY);
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain('hunter2');
    expect(decryptSecret(enc, KEY)).toBe('hunter2');
  });

  it('fails to decrypt with a wrong key', () => {
    const enc = encryptSecret('secret', KEY);
    const wrong = Buffer.alloc(32, 9).toString('base64');
    expect(() => decryptSecret(enc, wrong)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('produces an argon2id hash with the expected settings', async () => {
    expect(await hashPassword('correct horse battery')).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('verifies the right password only', async () => {
    const digest = await hashPassword('correct horse battery');
    expect(await verifyPassword({ hash: digest, password: 'correct horse battery' })).toBe(true);
    expect(await verifyPassword({ hash: digest, password: 'wrong horse battery' })).toBe(false);
  });

  it('rejects a hash in another format', async () => {
    expect(await verifyPassword({ hash: 'scrypt:abc', password: 'x' })).toBe(false);
  });
});

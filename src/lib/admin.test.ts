import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminStatus, isAdminEmail } from './admin';
import type { Session } from './session';

const session = (email: string, { enabled = false, verified = false } = {}) =>
  ({ user: { email, twoFactorEnabled: enabled }, session: { twoFactorVerified: verified } }) as unknown as Session;

describe('admin access', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('belongs to the ADMIN_EMAIL account only, whatever the case', () => {
    vi.stubEnv('ADMIN_EMAIL', ' Axel@Example.fr ');
    expect(isAdminEmail('axel@example.fr')).toBe(true);
    expect(isAdminEmail('player@example.fr')).toBe(false);
  });

  it('belongs to nobody without ADMIN_EMAIL', () => {
    vi.stubEnv('ADMIN_EMAIL', '');
    expect(isAdminEmail('')).toBe(false);
    expect(adminStatus(session(''))).toBeNull();
  });

  it('needs a session opened with a second factor', () => {
    vi.stubEnv('ADMIN_EMAIL', 'axel@example.fr');
    expect(adminStatus(null)).toBeNull();
    expect(adminStatus(session('player@example.fr', { enabled: true, verified: true }))).toBeNull();
    expect(adminStatus(session('axel@example.fr'))).toBe('enroll');
    expect(adminStatus(session('axel@example.fr', { enabled: true }))).toBe('reauthenticate');
    expect(adminStatus(session('axel@example.fr', { enabled: true, verified: true }))).toBe('granted');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { heldGoogleAccount, holdGoogleAccount, releaseGoogleAccount } from './app-google-sign-in';

vi.mock('./sign-in-actions', () => ({ googleClientIdAction: async () => null }));

describe('the Google account held for the signup', () => {
  const account = { idToken: 'token', email: 'player@example.com' };
  const now = Date.UTC(2026, 10, 15, 12);

  it('is kept until it is released', () => {
    holdGoogleAccount(account, now);
    expect(heldGoogleAccount(now + 60_000)).toEqual({ ...account, until: now + 50 * 60_000 });
    releaseGoogleAccount();
    expect(heldGoogleAccount(now + 60_000)).toBeNull();
  });

  it('is dropped before Google’s token expires, after an hour', () => {
    holdGoogleAccount(account, now);
    expect(heldGoogleAccount(now + 50 * 60_000)).toBeNull();
    expect(heldGoogleAccount(now)).toBeNull();
  });
});

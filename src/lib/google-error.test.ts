import { describe, expect, it } from 'vitest';
import { googleErrorFrom } from './google-error';

describe('googleErrorFrom', () => {
  it('reads the code, and what failed when the address says', () => {
    expect(googleErrorFrom({ error: 'state_mismatch' })).toEqual({ code: 'state_mismatch' });
    expect(googleErrorFrom({ error: 'app_sign_in_failed', error_description: '10: Developer error' })).toEqual({
      code: 'app_sign_in_failed',
      detail: '10: Developer error',
    });
  });

  it('has nothing without a code', () => {
    expect(googleErrorFrom({})).toBeUndefined();
    expect(googleErrorFrom({ error: '' })).toBeUndefined();
    expect(googleErrorFrom({ error: ['a', 'b'] })).toBeUndefined();
    expect(googleErrorFrom({ error_description: 'alone' })).toBeUndefined();
  });

  it('keeps what an address can carry short', () => {
    const error = googleErrorFrom({ error: 'x'.repeat(200), error_description: 'y'.repeat(500) });
    expect(error?.code).toHaveLength(64);
    expect(error?.detail).toHaveLength(120);
  });
});

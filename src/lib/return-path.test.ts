import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it.each(['/account', '/c/heritage/open?pack=1', '/'])('keeps the local path %s', (value) => {
    expect(safeReturnPath(value, '/account')).toBe(value);
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'account', ''])(
    'refuses %s',
    (value) => {
      expect(safeReturnPath(value, '/account')).toBe('/account');
    },
  );

  it('refuses a missing or repeated parameter', () => {
    expect(safeReturnPath(undefined, '/account')).toBe('/account');
    expect(safeReturnPath(['/a', '/b'], '/account')).toBe('/account');
  });
});

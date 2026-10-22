import { describe, expect, it } from 'vitest';
import { themeAttribute, themeCookie, themePreference } from './theme-preference';

const store = (value?: string) => ({ get: (name: string) => (name === 'theme' && value !== undefined ? { value } : undefined) });

describe('themePreference', () => {
  it('reads a light or dark choice, and follows the device otherwise', () => {
    expect(themePreference(store('light'))).toBe('light');
    expect(themePreference(store('dark'))).toBe('dark');
    expect(themePreference(store())).toBe('system');
    expect(themePreference(store('sepia'))).toBe('system');
  });
});

describe('themeAttribute', () => {
  it('forces a theme on <html> only for an explicit choice', () => {
    expect(themeAttribute('dark')).toBe('dark');
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('system')).toBeUndefined();
  });
});

describe('themeCookie', () => {
  it('keeps a choice for a year, over the whole site', () => {
    expect(themeCookie('dark', false)).toBe('theme=dark; Max-Age=31536000; Path=/; SameSite=Lax');
    expect(themeCookie('light', true)).toBe('theme=light; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
  });

  it('deletes the cookie to follow the device again', () => {
    expect(themeCookie('system', true)).toBe('theme=; Max-Age=0; Path=/; SameSite=Lax; Secure');
  });
});

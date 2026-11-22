import { describe, expect, it } from 'vitest';
import { announcementCookie, isSafeLink } from './announcement-shared';

describe('isSafeLink', () => {
  it('takes a page of the site or an https address', () => {
    expect(isSafeLink('/rules')).toBe(true);
    expect(isSafeLink('/c/heritage/market?card=x')).toBe(true);
    expect(isSafeLink('https://fr.wikipedia.org/wiki/Paris')).toBe(true);
  });

  it('refuses another site through //, plain http and scripts', () => {
    expect(isSafeLink('//evil.example')).toBe(false);
    expect(isSafeLink('/\\evil.example')).toBe(false);
    expect(isSafeLink('http://example.com')).toBe(false);
    expect(isSafeLink('javascript:alert(1)')).toBe(false);
    expect(isSafeLink('rules')).toBe(false);
  });
});

describe('announcementCookie', () => {
  it('keeps the closed announcement a year, secure over https', () => {
    expect(announcementCookie(12, true)).toBe('announcement=12; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
    expect(announcementCookie(12, false)).not.toContain('Secure');
  });
});

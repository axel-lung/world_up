import { describe, expect, it } from 'vitest';
import { collectionView, collectionViewCookie, isPhoneRequest } from './collection-view';

const store = (value?: string) => ({
  get: (name: string) => (name === 'collection-view' && value !== undefined ? { value } : undefined),
});

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe('collectionView', () => {
  it('reads the layout chosen', () => {
    expect(collectionView(store('list'))).toBe('list');
    expect(collectionView(store('grid'), true)).toBe('grid');
  });

  it('lays the cards out as a list on a phone and a grid elsewhere, until one is chosen', () => {
    expect(collectionView(store())).toBe('grid');
    expect(collectionView(store(), true)).toBe('list');
    expect(collectionView(store('table'))).toBe('grid');
    expect(collectionView(store('table'), true)).toBe('list');
  });
});

describe('isPhoneRequest', () => {
  it('believes the client hint first', () => {
    expect(isPhoneRequest(headers({ 'sec-ch-ua-mobile': '?1' }))).toBe(true);
    expect(isPhoneRequest(headers({ 'sec-ch-ua-mobile': '?0', 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36' }))).toBe(false);
  });

  it('falls back on the user agent: a phone or the app, not a tablet or a computer', () => {
    expect(isPhoneRequest(headers({ 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) Version/4.0 Chrome/131.0 Mobile Safari/537.36' }))).toBe(true);
    expect(isPhoneRequest(headers({ 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148' }))).toBe(true);
    expect(isPhoneRequest(headers({ 'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-X710) Chrome/131.0 Safari/537.36' }))).toBe(false);
    expect(isPhoneRequest(headers({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36' }))).toBe(false);
    expect(isPhoneRequest(headers({}))).toBe(false);
  });
});

describe('collectionViewCookie', () => {
  it('keeps the choice for a year, over the whole site', () => {
    expect(collectionViewCookie('list', true)).toBe('collection-view=list; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
    expect(collectionViewCookie('grid', false)).toBe('collection-view=grid; Max-Age=31536000; Path=/; SameSite=Lax');
  });
});

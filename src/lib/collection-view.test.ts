import { describe, expect, it } from 'vitest';
import { collectionView, collectionViewCookie } from './collection-view';

const store = (value?: string) => ({
  get: (name: string) => (name === 'collection-view' && value !== undefined ? { value } : undefined),
});

describe('collectionView', () => {
  it('reads the list, and lays the cards out as a grid otherwise', () => {
    expect(collectionView(store('list'))).toBe('list');
    expect(collectionView(store())).toBe('grid');
    expect(collectionView(store('grid'))).toBe('grid');
    expect(collectionView(store('table'))).toBe('grid');
  });
});

describe('collectionViewCookie', () => {
  it('keeps the list for a year, over the whole site', () => {
    expect(collectionViewCookie('list', true)).toBe('collection-view=list; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
  });

  it('deletes the cookie to go back to the grid, the default', () => {
    expect(collectionViewCookie('grid', false)).toBe('collection-view=; Max-Age=0; Path=/; SameSite=Lax');
  });
});

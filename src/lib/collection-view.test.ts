import { describe, expect, it } from 'vitest';
import { collectionView, collectionViewCookie } from './collection-view';

const store = (value?: string) => ({
  get: (name: string) => (name === 'collection-view' && value !== undefined ? { value } : undefined),
});

describe('collectionView', () => {
  it('reads the layout chosen', () => {
    expect(collectionView(store('list'))).toBe('list');
    expect(collectionView(store('grid'))).toBe('grid');
  });

  it('lays the cards out as a grid until one is chosen', () => {
    expect(collectionView(store())).toBe('grid');
    expect(collectionView(store('table'))).toBe('grid');
  });
});

describe('collectionViewCookie', () => {
  it('keeps the choice for a year, over the whole site', () => {
    expect(collectionViewCookie('list', true)).toBe('collection-view=list; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
    expect(collectionViewCookie('grid', false)).toBe('collection-view=grid; Max-Age=31536000; Path=/; SameSite=Lax');
  });
});

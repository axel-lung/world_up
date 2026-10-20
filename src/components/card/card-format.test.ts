import { describe, expect, it } from 'vitest';
import { displayName, needsLetterbox, photoSizes, seriesNumber } from './card-format';

describe('displayName', () => {
  it('capitalizes the first letter, accented ones included', () => {
    expect(displayName('abbaye du Thoronet')).toBe('Abbaye du Thoronet');
    expect(displayName('église Notre-Dame d’Attigny')).toBe('Église Notre-Dame d’Attigny');
  });
});

describe('seriesNumber', () => {
  it('pads the position to three digits', () => {
    expect(seriesNumber(4, 1452)).toBe('004/1452');
    expect(seriesNumber(1204, 2752)).toBe('1204/2752');
  });
});

describe('needsLetterbox', () => {
  it.each([
    ['landscape 4:3', 4000, 3000, false],
    ['wide 16:9', 1920, 1080, false],
    ['portrait (tour Eiffel)', 2900, 5367, true],
    ['panorama (pont du Gard)', 12648, 4882, true],
    ['square', 1000, 1000, true],
    ['unknown size', undefined, undefined, false],
  ])('%s', (_label, width, height, expected) => {
    expect(needsLetterbox(width, height)).toBe(expected);
  });
});

describe('photoSizes', () => {
  const sizes = '(max-width: 392px) calc(100vw - 32px), 360px';

  it('shrinks the sizes of a letterboxed portrait photo', () => {
    expect(photoSizes(sizes, 2900, 5367)).toBe('(max-width: 392px) calc(calc(100vw - 32px) * 0.41), calc(360px * 0.41)');
  });

  it('keeps them for other photos', () => {
    expect(photoSizes(sizes, 4000, 3000)).toBe(sizes);
    expect(photoSizes(sizes, 12648, 4882)).toBe(sizes);
    expect(photoSizes(sizes)).toBe(sizes);
    expect(photoSizes(undefined, 2900, 5367)).toBeUndefined();
  });
});

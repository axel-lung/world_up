import { describe, expect, it } from 'vitest';
import { displayName, needsLetterbox, seriesNumber } from './card-format';

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

import { describe, expect, it } from 'vitest';
import { isAdult, isValidBirthDate, isValidPseudo, normalizePseudo, todayInFrance } from './account-rules';

// 19 October 2026, 12:00 in Paris.
const now = new Date('2026-10-19T10:00:00Z');

describe('todayInFrance', () => {
  it('uses the Paris date, not the UTC one', () => {
    // 23:30 UTC on 31 December is already 1 January in Paris.
    expect(todayInFrance(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});

describe('isAdult', () => {
  it('accepts a player whose 18th birthday is today', () => {
    expect(isAdult('2008-10-19', now)).toBe(true);
  });

  it('rejects a player turning 18 tomorrow', () => {
    expect(isAdult('2008-10-20', now)).toBe(false);
  });

  it('switches at midnight Paris time', () => {
    // 22:30 UTC on 19 October is 00:30 on 20 October in Paris.
    expect(isAdult('2008-10-20', new Date('2026-10-19T22:30:00Z'))).toBe(true);
    expect(isAdult('2008-10-20', new Date('2026-10-19T21:30:00Z'))).toBe(false);
  });

  it('makes someone born on 29 February an adult on 1 March', () => {
    expect(isAdult('2008-02-29', new Date('2026-02-28T12:00:00Z'))).toBe(false);
    expect(isAdult('2008-02-29', new Date('2026-03-01T12:00:00Z'))).toBe(true);
  });
});

describe('isValidBirthDate', () => {
  it('accepts a real past date', () => {
    expect(isValidBirthDate('1990-05-31', now)).toBe(true);
  });

  it.each(['1990-02-30', '1990-13-01', '31/05/1990', '1990-5-31', '', '1899-12-31', '2026-10-20'])(
    'rejects %s',
    (value) => {
      expect(isValidBirthDate(value, now)).toBe(false);
    },
  );
});

describe('pseudo', () => {
  it.each(['Axel', 'élodie_75', 'jean-luc.d', 'abc', 'a'.repeat(20)])('accepts %s', (value) => {
    expect(isValidPseudo(value)).toBe(true);
  });

  it.each(['ab', 'a'.repeat(21), 'jean luc', 'axel@mail.fr', '<b>'])('rejects %s', (value) => {
    expect(isValidPseudo(value)).toBe(false);
  });

  it('trims and composes accents before checking', () => {
    expect(normalizePseudo('  Élodie ')).toBe('Élodie');
  });
});

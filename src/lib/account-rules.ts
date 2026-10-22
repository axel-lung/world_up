// Rules for signup and profile data, shared by the auth config (which enforces
// them) and the forms (which explain them).

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

// Version of the terms of use (/terms), the date of their text, stored in
// `consents`. Bump it when the published text changes: every player then
// accepts the new version on their next visit (/accept-terms).
export const TERMS_VERSION = '2026-10-22';
// Last change of the privacy policy (/privacy).
export const PRIVACY_VERSION = '2026-10-22';

// Letters (accents included), digits, dot, dash and underscore; 3 to 20 characters.
const PSEUDO_PATTERN = /^[\p{L}\p{N}._-]{3,20}$/u;

export function normalizePseudo(value: string): string {
  return value.normalize('NFC').trim();
}

export function isValidPseudo(value: string): boolean {
  return PSEUDO_PATTERN.test(value);
}

const ADULT_AGE = 18;
const BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's date in France, as YYYY-MM-DD: birthdays change at midnight Paris time. */
export function todayInFrance(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
}

/** A real calendar date (YYYY-MM-DD) between 1900-01-01 and today, or false. */
export function isValidBirthDate(value: string, now: Date): boolean {
  const match = BIRTH_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return exists && value >= '1900-01-01' && value <= todayInFrance(now);
}

/**
 * 18 or older today in France. Someone born on 29 February comes of age on
 * 1 March in non-leap years.
 */
export function isAdult(birthDate: string, now: Date): boolean {
  const [year, month, day] = todayInFrance(now).split('-');
  return birthDate <= `${Number(year) - ADULT_AGE}-${month}-${day}`;
}

// Error codes the auth API returns on top of Better Auth's own (BASE_ERROR_CODES).
// The forms show the AuthErrors.<code> message from messages/fr.json.
export const ACCOUNT_ERRORS = {
  INVALID_PSEUDO: 'The pseudo must have 3 to 20 letters, digits, dots, dashes or underscores',
  PSEUDO_TAKEN: 'This pseudo is already used',
  INVALID_BIRTH_DATE: 'Invalid birth date',
  UNDERAGE: 'Players must be 18 or older',
  TERMS_NOT_ACCEPTED: 'The terms of use must be accepted',
  BIRTH_DATE_LOCKED: 'The birth date cannot be changed',
} as const;

export type AccountErrorCode = keyof typeof ACCOUNT_ERRORS;

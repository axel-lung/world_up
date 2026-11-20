/**
 * Why a Google sign-in sent the player back to the login or signup page:
 * Better Auth's `?error=` code (ours in the app, GoogleButton.tsx), and what
 * failed when it says (`?error_description=`). The page shows a code it has no
 * message for, so that the player can quote it.
 */
export interface GoogleError {
  code: string;
  detail?: string;
}

const CODE_MAX = 64;
export const DETAIL_MAX = 120;

export function googleErrorFrom(params: Record<string, string | string[] | undefined>): GoogleError | undefined {
  const code = typeof params.error === 'string' ? params.error.trim().slice(0, CODE_MAX) : '';
  if (!code) return undefined;
  const detail = typeof params.error_description === 'string' ? params.error_description.trim().slice(0, DETAIL_MAX) : '';
  return detail ? { code, detail } : { code };
}

'use server';

import { googleCredentials } from './sign-in-methods';

/**
 * Google's OAuth client ID, which the app's native sign-in asks Google's ID
 * token for (GoogleButton.tsx): the server only accepts tokens issued to it.
 * Public, like the address of Google's sign-in page that carries it.
 */
export async function googleClientIdAction(): Promise<string | null> {
  return googleCredentials()?.clientId ?? null;
}

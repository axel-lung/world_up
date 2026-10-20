import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { Auth } from './auth';

// The forms call the auth API from the browser, through /api/auth: its rate
// limits only apply to HTTP requests, not to server-side auth.api calls.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});

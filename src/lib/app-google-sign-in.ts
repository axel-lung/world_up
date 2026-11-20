import { googleClientIdAction } from './sign-in-actions';

// The phone's own Google sign-in, in the Android app (GoogleButton.tsx):
// Google refuses its sign-in page in a WebView, so the phone's Credential
// Manager gives an ID token issued to the site's web client, which Better Auth
// checks. Imported on use: a browser never loads the plugin.

export interface PhoneGoogleAccount {
  idToken: string;
  email: string | null;
}

/** The phone's sign-in failed: what its plugin said, for the player to quote (GoogleErrorNotice). */
export interface PhoneGoogleFailure {
  failed: string;
}

/** The plugin's error as a short line: its code, then its message. */
function describe(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  const parts = [code, message].filter((part): part is string | number => typeof part === 'string' || typeof part === 'number');
  return parts.length ? parts.join(' ') : String(error);
}

/**
 * Asks the phone for one of its Google accounts. `sheet`: the sheet that rises
 * from the bottom ("Continuer en tant que…"), offered unasked at the first
 * launch; otherwise Google's dialog, every account and a way to add one, for a
 * button. Without any account on the phone, the plugin falls back to the dialog.
 */
export async function askPhoneForGoogle({ sheet = false } = {}): Promise<PhoneGoogleAccount | PhoneGoogleFailure | 'cancelled'> {
  try {
    // The module, never a promise of the plugin: a Capacitor plugin is a proxy
    const [{ SocialLogin }, webClientId] = await Promise.all([
      import('@capgo/capacitor-social-login'),
      googleClientIdAction(),
    ]);
    if (!webClientId) throw new Error('Google sign-in is off on the server');
    // Only the ID token: without this, the plugin then asks Google for an
    // access token too, and a Google account the app has never seen needs a
    // consent screen there, which Capacitor's own activity can't show
    // ("requires user interaction"), so the sign-in failed.
    await SocialLogin.initialize({ google: { webClientId, skipAuthOnlyAuthorizationAfterSignIn: true } });
    const { result } = await SocialLogin.login({ provider: 'google', options: sheet ? { style: 'bottom' } : {} });
    if (result.responseType === 'online' && result.idToken) return { idToken: result.idToken, email: result.profile.email };
    return { failed: `no ID token (${result.responseType})` };
  } catch (error) {
    if ((error as { code?: string }).code === 'USER_CANCELLED') return 'cancelled';
    console.error('Google sign-in failed in the app', error);
    return { failed: describe(error) };
  }
}

// The account the first launch's sheet gave when it has no World Up account
// yet: the signup form it leads to uses it rather than asking the phone again.
// In memory only, for that one navigation; Google's ID token lasts an hour.
const HOLD_MS = 50 * 60_000;
let held: (PhoneGoogleAccount & { until: number }) | null = null;

export function holdGoogleAccount(account: PhoneGoogleAccount, now = Date.now()) {
  held = { ...account, until: now + HOLD_MS };
}

export function heldGoogleAccount(now = Date.now()): PhoneGoogleAccount | null {
  if (held && held.until <= now) held = null;
  return held;
}

export function releaseGoogleAccount() {
  held = null;
}

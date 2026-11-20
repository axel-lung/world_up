import type { PushState } from './push-device';

// In the app, a player whose phone doesn't get the notifications is asked to
// turn them on (PushPrompt), once after each sign-in and once after each
// update of the app. Signing out turns them off on the phone
// (forgetPushDevice), so signing in again is when they are most often missing.

/** What the phone remembers it has asked about: the session (its sign-in time) and the app's build. */
export function pushPromptKey(signedInAt: number, build: string | null): string {
  return `${signedInAt}:${build ?? ''}`;
}

export interface PromptMemory {
  asked(key: string): boolean;
  remember(key: string): void;
}

/**
 * Whether to ask now: not yet asked for this key, and the notifications are
 * off on this phone. Once the phone's state is known the key is remembered,
 * whatever it is: a player who said no, or who has them on, isn't asked again
 * before the next sign-in or update. Notifications blocked in the phone's
 * settings ('denied') can't be asked for: /activity says where to allow them.
 */
export async function needsPushPrompt(
  key: string,
  memory: PromptMemory,
  state: () => Promise<PushState>,
): Promise<boolean> {
  if (memory.asked(key)) return false;
  let current: PushState;
  try {
    current = await state();
  } catch {
    // Asked again on the next page
    return false;
  }
  memory.remember(key);
  return current === 'off';
}

const ASKED_KEY = 'worldup.pushPrompt';

/** The phone's memory of the last prompt, in localStorage. */
export const promptMemory: PromptMemory = {
  asked(key) {
    try {
      return localStorage.getItem(ASKED_KEY) === key;
    } catch {
      // Unable to remember it: better never than on every page
      return true;
    }
  },
  remember(key) {
    try {
      localStorage.setItem(ASKED_KEY, key);
    } catch {
      // asked() can't read it either
    }
  },
};

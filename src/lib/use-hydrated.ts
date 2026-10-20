import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False in the server HTML, true once React runs in the browser. The account
 * forms submit through JavaScript: their buttons wait for it, so an early
 * click cannot reload the page and wipe what the player typed.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

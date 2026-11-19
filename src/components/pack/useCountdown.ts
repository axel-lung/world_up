'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Milliseconds left until `target`, ticking every second. Display only: the
 * server decides when a pack arrives. `serverNow` is the server time the page
 * was rendered at; it gives the first value (identical on server and client)
 * and corrects the visitor's clock.
 */
export function useCountdown(target: string | null, serverNow: string): number {
  const remainingAt = (now: number) => (target ? Math.max(0, Date.parse(target) - now) : 0);
  const [remaining, setRemaining] = useState(() => remainingAt(Date.parse(serverNow)));
  // A new target (a pack opened from a full reserve starts the timer) shows its
  // value right away, instead of the previous one until the next tick
  const [shown, setShown] = useState({ target, serverNow });
  if (shown.target !== target || shown.serverNow !== serverNow) {
    setShown({ target, serverNow });
    setRemaining(remainingAt(Date.parse(serverNow)));
  }

  useEffect(() => {
    if (!target) return;
    const clockOffset = Date.parse(serverNow) - Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, Date.parse(target) - (Date.now() + clockOffset));
      setRemaining(left);
      if (left === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [target, serverNow]);

  return remaining;
}

// The next-pack times already asked for: the header's timer and the page's
// count down to the same time, and only one of them asks the server
const arrived = new Set<string>();

/**
 * Once the countdown to the next free pack is over, asks the server for the
 * page again, so that the header, the tab bar and the page show the new pack:
 * the browser never adds it itself. The countdown follows the server's clock as
 * it was at render, a little behind the real one, so when it ends the server
 * has reached `target` too.
 */
export function useRefreshWhenDue(target: string | null, remaining: number) {
  const router = useRouter();
  useEffect(() => {
    if (!target || remaining > 0 || arrived.has(target)) return;
    arrived.add(target);
    router.refresh();
  }, [target, remaining, router]);
}

/** "04:32" */
export function formatCountdown(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

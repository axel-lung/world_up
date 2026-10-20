'use client';

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

/** "04:32" */
export function formatCountdown(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

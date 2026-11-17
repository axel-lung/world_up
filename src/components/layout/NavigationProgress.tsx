'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './NavigationProgress.module.css';

/** How long the bar waits for the next page: past it, the navigation failed or went nowhere. */
const GIVE_UP_MS = 15_000;

/** Whether a link or a form leads to another page of the site, not the same one or another site. */
function leadsElsewhere(target: URL): boolean {
  return (
    target.origin === window.location.origin &&
    (target.pathname !== window.location.pathname || target.search !== window.location.search)
  );
}

/**
 * A bar across the top of the screen while the next page loads, so that a tap
 * answers at once, as in a native app: the pages render on the server, and the
 * screen would stay as it was until the next one arrives. It starts on a click
 * on a link, or a GET form sent (the filters), to another page of the site, and
 * ends when the address changes. It shows only after a moment (the CSS), so
 * that a page that comes at once doesn't flash it.
 */
export function NavigationProgress() {
  const here = `${usePathname()}?${useSearchParams().toString()}`;
  // The address a navigation left from, while it is still the current one
  const [leaving, setLeaving] = useState<string | null>(null);
  if (leaving !== null && leaving !== here) setLeaving(null);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      if (leadsElsewhere(new URL(link.href))) setLeaving(here);
    }
    function onSubmit(event: SubmitEvent) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method !== 'get') return;
      const target = new URL(form.action);
      const fields = [...new FormData(form, event.submitter)].map(([name, value]) => [name, String(value)]);
      target.search = new URLSearchParams(fields).toString();
      if (leadsElsewhere(target)) setLeaving(here);
    }
    // Capture: Next.js's links stop the click's default before it bubbles
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, [here]);

  useEffect(() => {
    if (leaving === null) return;
    const timer = setTimeout(() => setLeaving(null), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return leaving === null ? null : <div className={styles.bar} aria-hidden="true" />;
}

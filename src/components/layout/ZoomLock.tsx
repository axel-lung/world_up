'use client';

import { useEffect } from 'react';

function cancel(event: Event) {
  event.preventDefault();
}

/**
 * Stops Safari's pinch zoom on iPhone and iPad, which ignores the viewport's
 * user-scalable=no (layout.tsx). Elsewhere touch-action does it (theme.css),
 * and these events, WebKit's own, never fire. Renders nothing.
 */
export function ZoomLock() {
  useEffect(() => {
    const options = { passive: false };
    document.addEventListener('gesturestart', cancel, options);
    document.addEventListener('gesturechange', cancel, options);
    return () => {
      document.removeEventListener('gesturestart', cancel);
      document.removeEventListener('gesturechange', cancel);
    };
  }, []);
  return null;
}

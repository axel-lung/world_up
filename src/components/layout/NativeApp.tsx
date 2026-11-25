'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isNativeApp } from '@/lib/native-app';
import { openTouchedNotifications, refreshAppPushToken } from '@/lib/notifications/app-push-device';

const REFRESHED_KEY = 'worldup.pushRefreshed';

/** Whether this launch of the app has checked its push token yet; the session lasts as long as the app. */
function firstTimeThisLaunch(): boolean {
  try {
    if (sessionStorage.getItem(REFRESHED_KEY)) return false;
    sessionStorage.setItem(REFRESHED_KEY, '1');
  } catch {
    // Checked again on the next page: harmless
  }
  return true;
}

/** Gives the phone's system bars the ground of the page as it is drawn now. */
function repaintSystemBars() {
  void import('@/lib/app-system-bars').then(({ paintSystemBars }) => paintSystemBars());
}

/**
 * The page's share of the Android app (android/README.md): marks the page as
 * the app's (data-app, for the styles of theme.css), hides the splash screen
 * once the page is drawn, gives the system bars the page's ground, opens the
 * page of a notification the player touched, and keeps the phone's push token
 * current. Renders nothing, and does nothing in a browser.
 */
export function NativeApp() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.dataset.app = '';
    let stop: (() => void) | undefined;
    let live = true;
    void import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide());
    void openTouchedNotifications().then((remove) => {
      if (live) stop = remove;
      else remove();
    });
    if (firstTimeThisLaunch()) refreshAppPushToken().catch(() => undefined);
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  // Each page, once drawn: the pack opening's stage is darker than the stone
  useEffect(() => {
    if (!isNativeApp()) return;
    const frame = requestAnimationFrame(repaintSystemBars);
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}

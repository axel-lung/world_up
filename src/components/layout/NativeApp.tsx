'use client';

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

/**
 * The page's share of the Android app (android/README.md): hides the splash
 * screen once the page is drawn, opens the page of a notification the player
 * touched, and keeps the phone's push token current. Renders nothing, and does
 * nothing in a browser.
 */
export function NativeApp() {
  useEffect(() => {
    if (!isNativeApp()) return;
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
  return null;
}

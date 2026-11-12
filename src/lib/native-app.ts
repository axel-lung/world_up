import { Capacitor } from '@capacitor/core';

// The Android app (android/README.md) shows the site in its own WebView, where
// Capacitor's bridge lets the page call the app's native plugins. The site
// uses them where a browser's way doesn't work in a WebView: Google sign-in
// (GoogleButton.tsx) and notifications (app-push-device.ts). Each plugin is
// imported on use, so a browser never loads it.

/** Whether the page runs in the app rather than in a browser. Browser side only. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

import type { CapacitorConfig } from '@capacitor/cli';

// The Android app (android/README.md): a native shell whose own WebView shows
// the production site, with no browser in between. `npx cap sync android`
// writes this into the Android project. CAPACITOR_SERVER_URL points a build at
// another site, such as staging, or http://localhost:3000 for a development
// server reached through `adb reverse tcp:3000 tcp:3000`.
const url = process.env.CAPACITOR_SERVER_URL || 'https://worldup.alng.fr';

const config: CapacitorConfig = {
  appId: 'fr.alng.worldup',
  appName: 'World Up',
  webDir: 'native/www',
  server: {
    url,
    // Plain HTTP for a development server only
    cleartext: url.startsWith('http://'),
    // Packaged with the app, shown when the site can't be reached; the site's
    // own error pages (404...) still show (MainActivity.java)
    errorPath: 'index.html',
  },
  // No zoom in the WebView, as on the site (layout.tsx). Capacitor's default,
  // written out since the game depends on it.
  zoomEnabled: false,
  // The WebView is transparent until the site paints its ground, over the
  // splash's logo (MainActivity.java, activity_main.xml)
  plugins: {
    // Hidden by the site as soon as it is drawn (NativeApp.tsx), or after 3 s;
    // the logo stays behind the WebView until the site comes
    SplashScreen: {
      launchShowDuration: 3000,
      launchFadeOutDuration: 300,
      backgroundColor: '#F5EAD8',
      showSpinner: false,
    },
    // A notification shows while the app is open too, as Web Push's do on the site
    PushNotifications: {
      presentationOptions: ['alert', 'sound'],
    },
    // Google only: no Facebook SDK nor any other provider's code in the app
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
      logLevel: 1,
    },
  },
};

export default config;

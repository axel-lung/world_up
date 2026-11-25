import type { Metadata, Viewport } from 'next';
import { Alegreya_Sans, Alfa_Slab_One, Cinzel } from 'next/font/google';
import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { NativeApp } from '@/components/layout/NativeApp';
import { NavigationProgress } from '@/components/layout/NavigationProgress';
import { ZoomLock } from '@/components/layout/ZoomLock';
import { getDefaultThemeCss } from '@/lib/collections';
import { indexingAllowed } from '@/lib/indexing';
import '@/styles/global.css';

// Self-hosted by Next.js: no request to Google from the visitor's browser. Not
// preloaded either: on a card page they would share the bandwidth with the
// photo, the pages' largest paint. The "vitrail" voices (decided on 2026-11-25):
// Alegreya Sans carries the text...
const alegreya = Alegreya_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
  variable: '--font-alegreya',
  display: 'swap',
  preload: false,
});
// ...Cinzel the titles and the buttons (variable font: one file for every weight)...
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel', display: 'swap', preload: false });
// ...and Alfa Slab One the figures and the monuments' names.
const alfaSlab = Alfa_Slab_One({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-alfa-slab',
  display: 'swap',
  preload: false,
});

// No zoom, on the site as in the app (decided on 2026-11-21): the page keeps
// the phone's width. Safari ignores user-scalable, but keeps maximum-scale,
// so a focused field doesn't zoom in; theme.css and ZoomLock stop its pinch
// and double tap.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');
  return {
    // Canonical and Open Graph addresses are relative to the site's public address
    metadataBase: process.env.APP_URL ? new URL(process.env.APP_URL) : undefined,
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
    robots: indexingAllowed() ? undefined : { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // The collection theme lives in the database: render at request time.
  await connection();
  const [locale, themeCss] = await Promise.all([getLocale(), getDefaultThemeCss()]);
  return (
    // One theme, the dark "vitrail" (decided on 2026-11-25): data-theme="dark"
    // picks the collection's dark accent (collectionThemeCss)
    <html lang={locale} className={`${alegreya.variable} ${cinzel.variable} ${alfaSlab.variable}`} data-theme="dark">
      <head>
        {/* Validated by parseCollectionTheme: only custom properties, no markup. */}
        {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        {/* It reads the address's query (useSearchParams) */}
        <Suspense>
          <NavigationProgress />
        </Suspense>
        <NativeApp />
        <ZoomLock />
      </body>
    </html>
  );
}

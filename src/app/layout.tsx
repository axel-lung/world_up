import type { Metadata } from 'next';
import { Caprasimo, Figtree } from 'next/font/google';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { getDefaultThemeCss } from '@/lib/collections';
import { indexingAllowed } from '@/lib/indexing';
import { themeAttribute, themePreference } from '@/lib/theme-preference';
import '@/styles/global.css';

// Self-hosted by Next.js: no request to Google from the visitor's browser. Not
// preloaded either: on a card page they would share the bandwidth with the
// photo, the pages' largest paint.
// Figtree carries the text (variable font: one file for every weight)...
const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap', preload: false });
// ...and Caprasimo is the only display voice: headings, monument names, buttons.
const caprasimo = Caprasimo({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-caprasimo',
  display: 'swap',
  preload: false,
});

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
  const [locale, themeCss, cookieStore] = await Promise.all([getLocale(), getDefaultThemeCss(), cookies()]);
  return (
    // The visitor's theme choice (src/components/layout/ThemeSwitch.tsx), if any
    <html
      lang={locale}
      className={`${figtree.variable} ${caprasimo.variable}`}
      data-theme={themeAttribute(themePreference(cookieStore))}
    >
      <head>
        {/* Validated by parseCollectionTheme: only custom properties, no markup. */}
        {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}

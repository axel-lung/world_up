import type { Metadata } from 'next';
import { Inter, Overpass } from 'next/font/google';
import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { getDefaultThemeCss } from '@/lib/collections';
import '@/styles/global.css';

// Self-hosted by Next.js: no request to Google from the visitor's browser.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
// Display face of the heritage skin (pack, series headers, card names).
const overpass = Overpass({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-overpass',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Metadata');
  return { title: t('title'), description: t('description') };
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // The collection theme lives in the database: render at request time.
  await connection();
  const [locale, themeCss] = await Promise.all([getLocale(), getDefaultThemeCss()]);
  return (
    <html lang={locale} className={`${inter.variable} ${overpass.variable}`}>
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

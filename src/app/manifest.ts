import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';

// The web app manifest (/manifest.webmanifest): installing the site, and the
// Android app's name, colors and icons (android/twa-manifest.json repeats them).
// The icons in public/icons come from the World Up logo (see CLAUDE.md, "Android app").
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations('Metadata');
  return {
    name: t('title'),
    short_name: t('title'),
    description: t('description'),
    lang: 'fr',
    start_url: '/',
    display: 'standalone',
    // The light theme's ground (--color-bg in src/styles/theme.css)
    background_color: '#f5ead8',
    theme_color: '#f5ead8',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/monochrome-512.png', sizes: '512x512', type: 'image/png', purpose: 'monochrome' },
    ],
  };
}

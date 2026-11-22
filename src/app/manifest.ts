import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_COLLECTION_SLUG } from '@/lib/collections';
import { gamePath } from '@/lib/game/paths';

// The web app manifest (/manifest.webmanifest): installing the site from a
// browser. The icons in public/icons come from the World Up logo (see
// CLAUDE.md, "Android app"), as do the Android app's own (android/).
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
    // The installed site's long press, as in the Android app (android/app/src/main/res/xml/shortcuts.xml)
    shortcuts: [
      {
        name: t('shortcutOpen'),
        short_name: t('shortcutOpenShort'),
        url: gamePath(DEFAULT_COLLECTION_SLUG).open,
        icons: [
          { src: '/icons/shortcut-open-96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icons/shortcut-open-192.png', sizes: '192x192', type: 'image/png' },
        ],
      },
    ],
  };
}

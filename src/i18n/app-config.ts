import type messages from '../../messages/fr.json';

// Type-checks translation keys: t('HomePage.missing') fails at compile time.
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'fr';
    Messages: typeof messages;
  }
}

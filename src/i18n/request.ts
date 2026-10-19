import { getRequestConfig } from 'next-intl/server';

// French only for now, without locale prefixes in URLs. Every interface text
// still goes through messages/<locale>.json so the game can be translated later.
export default getRequestConfig(async () => {
  const locale = 'fr';
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

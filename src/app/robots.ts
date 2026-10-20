import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { indexingAllowed } from '@/lib/indexing';
import { requireEnv } from '@/lib/env';

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  if (!indexingAllowed()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/account', '/admin', '/api/'] },
    sitemap: `${requireEnv('APP_URL')}/sitemap.xml`,
  };
}

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // The Docker image runs .next/standalone/server.js (see Dockerfile).
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [
      {
        // The Web Push service worker (public/sw.js): browsers check it for an
        // update on every visit, and it loads nothing from elsewhere.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // The Docker image runs .next/standalone/server.js (see Dockerfile).
  output: 'standalone',
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);

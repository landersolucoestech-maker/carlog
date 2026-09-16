import type { NextConfig } from 'next';

const pagesPreview = process.env.CARLOG_PAGES_PREVIEW === '1';

const nextConfig: NextConfig = {
  output: pagesPreview ? 'export' : 'standalone',
  trailingSlash: pagesPreview,
  poweredByHeader: false,
  reactStrictMode: true,
  ...(pagesPreview ? { basePath: '/carlog', assetPrefix: '/carlog/' } : {}),
};

export default nextConfig;

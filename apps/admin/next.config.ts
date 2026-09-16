import type { NextConfig } from 'next';

const pagesPreview = process.env.CARLOG_PAGES_PREVIEW === '1';

const nextConfig: NextConfig = {
  output: pagesPreview ? 'export' : 'standalone',
  basePath: pagesPreview ? '/carlog/admin' : undefined,
  assetPrefix: pagesPreview ? '/carlog/admin/' : undefined,
  trailingSlash: pagesPreview,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;

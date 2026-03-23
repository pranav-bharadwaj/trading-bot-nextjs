/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: process.env.NODE_ENV === 'production' ? '/trading-bot-nextjs' : '',
  reactStrictMode: true,
  trailingSlash: true,
};

module.exports = nextConfig;

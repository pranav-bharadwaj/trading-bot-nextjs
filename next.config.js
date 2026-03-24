/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // GitHub Pages needs basePath, Vercel deploys to root
  basePath: process.env.DEPLOY_TARGET === 'github' ? '/trading-bot-nextjs' : '',
  reactStrictMode: true,
  trailingSlash: true,
};

module.exports = nextConfig;

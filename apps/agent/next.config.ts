import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@pgd-vercel-ci/agent-core'],
};

export default config;

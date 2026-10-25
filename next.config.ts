import type { NextConfig } from 'next';

const showDevIndicators = process.env.NEXT_DEV_INDICATORS === '1';

const nextConfig: NextConfig = {
  // The dashboard is a local-only tool: one Node process, one SQLite file.
  // Nothing here is meant to be deployed.
  //
  // Hidden by default; set NEXT_DEV_INDICATORS=1 to show the Next.js dev tools.
  devIndicators: showDevIndicators ? { position: 'bottom-left' } : false,
  outputFileTracingRoot: process.cwd(),
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

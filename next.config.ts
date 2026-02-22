import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;

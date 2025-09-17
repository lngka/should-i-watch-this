import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Keep eslint in dev, but don't block production builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

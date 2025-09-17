import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Keep eslint in dev, but don't block production builds
    ignoreDuringBuilds: true,
  },
  turbopack: {
    rules: {
      // Handle README.md files that are being imported incorrectly
      "*.md": {
        loaders: ["ignore-loader"],
      },
      // Handle LICENSE files that are being parsed as JS
      "*.LICENSE": {
        loaders: ["ignore-loader"],
      },
      "LICENSE": {
        loaders: ["ignore-loader"],
      },
    },
  },
  // Exclude problematic packages from server external packages
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-libsql",
    // Remove @libsql/client from external packages to resolve version conflicts
  ],
  // Configure webpack to handle Prisma properly
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude problematic files from webpack processing
      config.externals = config.externals || [];
      config.externals.push({
        "@libsql/client": "commonjs @libsql/client",
        "libsql": "commonjs libsql",
      });
    }
    
    // Ignore README and LICENSE files
    config.module.rules.push({
      test: /\.(md|LICENSE)$/,
      use: "ignore-loader",
    });
    
    return config;
  },
};

export default nextConfig;

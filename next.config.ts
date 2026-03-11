import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // Disable webpack caching to save memory on low-RAM devices
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },

  // Allow cross-origin requests from local network
  allowedDevOrigins: ['192.168.0.237', 'localhost'],
};

export default nextConfig;

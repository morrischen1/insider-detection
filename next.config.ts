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
    // Reduce memory usage
    config.optimization = {
      ...config.optimization,
      minimize: false, // Disable minification in dev for faster builds
    };
    return config;
  },

  // Allow cross-origin requests from local network
  allowedDevOrigins: ['192.168.0.237', 'localhost'],
  
  // Experimental features for memory optimization
  experimental: {
    // Reduce memory usage during build
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;

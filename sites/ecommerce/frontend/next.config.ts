import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Turbopack for faster development
  experimental: {
    turbo: {},
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/api/scan": ["./next.config.ts"],
  },
};

export default nextConfig;

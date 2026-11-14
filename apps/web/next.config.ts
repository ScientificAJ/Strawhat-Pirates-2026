import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  async rewrites() {
    return [
      { source: "/v1/:path*", destination: "http://127.0.0.1:8100/v1/:path*" },
    ];
  },
  devIndicators: false,
};

export default config;

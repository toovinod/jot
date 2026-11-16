import type { NextConfig } from "next";
const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:8080";
const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  transpilePackages: ["@jot/contracts"],
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/media/:path*", destination: `${api}/media/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;

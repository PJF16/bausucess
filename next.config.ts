import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // The cap is for the full multipart body; 20 KiB covers form overhead
      // while the action itself enforces a 10 MiB file limit.
      bodySizeLimit: 10 * 1024 * 1024 + 20 * 1024,
    },
  },
};

export default nextConfig;

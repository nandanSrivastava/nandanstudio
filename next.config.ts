import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed COOP/COEP headers because they block fetching resources from unpkg.com
};

export default nextConfig;

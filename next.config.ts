import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  async redirects() {
    // Campaigns merged into the ad-driven "Campagnes" view (/ads)
    return [
      { source: '/campaigns', destination: '/ads', permanent: false },
    ]
  },
};

export default nextConfig;

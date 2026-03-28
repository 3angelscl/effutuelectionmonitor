import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Limit server-side body parsing for API routes
  serverExternalPackages: ['jspdf', 'jspdf-autotable'],

  // Fix Turbopack root detection in monorepo-like structure
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },

  // Image optimization config
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;

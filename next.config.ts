import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Limit server-side body parsing for API routes
  serverExternalPackages: ['jspdf', 'jspdf-autotable'],

  // Fix Turbopack workspace root — prevents it picking up the wrong lockfile
  turbopack: {
    root: path.resolve(__dirname),
  },

  experimental: {
    // Disable Turbopack filesystem cache during development so code changes
    // are always reflected immediately without stale SSR bundles.
    turbopackFileSystemCacheForDev: false,
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
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            // Note: 'unsafe-inline' is required because Next.js injects inline scripts at runtime.
            // A full nonce-based CSP (via middleware) would allow removing it.
            // 'unsafe-eval' is stripped in production — it's only needed for Next.js HMR in dev.
            value: [
              "default-src 'self'",
              process.env.NODE_ENV === 'development'
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://unpkg.com",
              "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.public.blob.vercel-storage.com https://res.cloudinary.com",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // Image optimization config
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;

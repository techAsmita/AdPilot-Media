import type { NextConfig } from "next";

// Notes on the CSP below:
// - 'unsafe-inline' is required for scripts because the theme is applied by an
//   inline script in app/layout.tsx (to avoid a flash) and Next.js injects its
//   own inline bootstrap. Tightening this means moving to a nonce issued from
//   middleware; until then the policy still blocks third-party script origins,
//   which is the attack this mostly guards against.
// - img-src allows data: and blob: because generated images arrive as base64
//   data URLs rather than from a storage origin.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
      // The agent stream must not be cached or buffered by a proxy.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;

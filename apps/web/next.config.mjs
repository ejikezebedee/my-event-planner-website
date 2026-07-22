import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${apiUrl}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Optional same-origin API proxy (all-in-one/demo deployments): when the
  // client bundle is built with NEXT_PUBLIC_API_URL="", requests to
  // /api/v1/* are proxied to the internal API service.
  async rewrites() {
    const internal = process.env.API_INTERNAL_URL;
    if (!internal) return [];
    return [{ source: "/api/v1/:path*", destination: `${internal}/api/v1/:path*` }];
  },
  transpilePackages: ["@mep/ui", "@mep/types", "@mep/validation"],
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: join(__dirname, "../../"),
};

export default nextConfig;

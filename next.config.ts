/**
 * Next.js application configuration for Spiral (`next.config.ts`).
 *
 * Configures `output: "standalone"` for container deployment on Google Cloud Run,
 * keeping all Gemini Interactions API and Firestore Admin operations strictly on the server.
 */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;

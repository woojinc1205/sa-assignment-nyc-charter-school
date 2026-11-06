import type { NextConfig } from "next";

// Static export: `next build` writes a plain static site to out/ (no backend, PRD section 7).
// For GitHub Pages project sites set NEXT_PUBLIC_BASE_PATH=/<repo-name> at build time.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Next.js 16 writes an AGENTS.md for AI coding agents on `next dev`; this project doesn't track it.
  agentRules: false,
};

export default nextConfig;

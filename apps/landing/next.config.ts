import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Anchor Turbopack + output tracing to this file's directory rather than
// `process.cwd()`. With the root cornell-hackathon `package-lock.json` present,
// Turbopack would otherwise walk up and try to resolve modules (tailwindcss,
// react, …) from `apps/` where they aren't installed.
const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: here,
  images: {
    unoptimized: true,
  },
  pageExtensions: ["ts", "tsx", "mdx"],
  turbopack: {
    root: here,
  },
};

export default nextConfig;

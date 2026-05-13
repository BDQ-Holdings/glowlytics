import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: process.cwd(),
  images: {
    unoptimized: true,
  },
  pageExtensions: ["ts", "tsx", "mdx"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

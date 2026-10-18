import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM Postgres; let Node load it as-is instead of bundling it.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;

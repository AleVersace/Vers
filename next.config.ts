import type { NextConfig } from "next";
import { resolveSourceUrl } from "./scripts/source-url.mjs";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SOURCE_URL: resolveSourceUrl(
      process.env.NEXT_PUBLIC_SOURCE_URL,
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT,
    ),
  },
};

export default nextConfig;

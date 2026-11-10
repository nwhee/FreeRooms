import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { missingDataUrlWarning } from "./lib/data/data-url";

const nextConfig: NextConfig = {
  // CLAUDE.md is this repo's agent guide; stop `next dev` from writing AGENTS.md.
  agentRules: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    const warning = missingDataUrlWarning(process.env.NEXT_PUBLIC_DATA_URL);
    if (warning) console.warn(warning);
  }
  return nextConfig;
}

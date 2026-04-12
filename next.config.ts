import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["host.docker.internal", "localhost"],
  serverExternalPackages: ["node-ical", "rrule-temporal", "temporal-polyfill"],
};

export default nextConfig;

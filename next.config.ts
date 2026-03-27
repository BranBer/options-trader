import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["host.docker.internal", "localhost"],
};

export default nextConfig;

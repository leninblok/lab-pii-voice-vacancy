import type { NextConfig } from "next";

// The local browser is opened through 127.0.0.1 while Next starts on
// localhost. Allow both development origins so HMR and client chunks load.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};
export default nextConfig;

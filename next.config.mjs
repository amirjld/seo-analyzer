/** @type {import('next').NextConfig} */

const nextConfig = {
  reactCompiler: true,
  compress: true,
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;

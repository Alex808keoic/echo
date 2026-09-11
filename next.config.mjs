/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  agentRules: false,
  images: {
    unoptimized: true,
  },
}

export default nextConfig

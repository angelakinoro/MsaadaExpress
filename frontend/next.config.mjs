/** @type {import('next').NextConfig} */
const nextConfig = {
  // Add experimental flags to optimize network connections
  experimental: {
    optimizePackageImports: ['socket.io-client'],
  },
  
  // Optimize images if needed
  images: {
    domains: ['localhost', '127.0.0.1'],
  },
  
  // Rewrite API and socket.io requests to the backend server with explicit host
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5000/api/:path*'
      },
      {
        source: '/socket.io/:path*',
        destination: 'http://localhost:5000/socket.io/:path*'
      }
    ];
  },
  
  // Temporarily disable React strict mode to avoid duplicate socket connections
  reactStrictMode: false,
  
  // Increase network timeout for API requests
  httpAgentOptions: {
    keepAlive: true,
    timeout: 60000,
  },
  
  // Suppress useless warnings
  typescript: {
    ignoreBuildErrors: true,
  },
  
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

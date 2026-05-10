/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Proxy de API para evitar CORS em desenvolvimento
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },

  images: {
    domains: ['localhost', 'res.cloudinary.com'],
  },
};

module.exports = nextConfig;

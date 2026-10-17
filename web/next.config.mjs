/** @type {import('next').NextConfig} */
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.cdninstagram.com https://*.fbcdn.net",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['mysql2', 'bcryptjs', 'nodemailer'],
  // As páginas do Portal das Coordenações só saem pelo servidor, que confere se o Portal está ligado (padrão: desligado).
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/solicitante.html', destination: '/api/portal/pagina/solicitante.html' },
        { source: '/portal.js', destination: '/api/portal/pagina/portal.js' },
        { source: '/manifest-portal.webmanifest', destination: '/api/portal/pagina/manifest-portal.webmanifest' },
      ],
    };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        ],
      },
      // arquivos enviados pelos usuários: CSP própria (sem scripts); a regra vem depois da global e a substitui
      ...['/api/file', '/api/portal/file', '/api/public/approval/file'].map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-ancestors 'none'; sandbox allow-same-origin" }],
      })),
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
};
export default nextConfig;

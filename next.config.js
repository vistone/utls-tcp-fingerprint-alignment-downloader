const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@currentspace/http3'],
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

module.exports = withNextIntl(nextConfig);

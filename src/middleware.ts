import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/' || pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/_vercel')) {
    return;
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
};

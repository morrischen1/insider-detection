import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateSession, isAuthEnabled } from './lib/auth';

// Routes that don't require authentication
const publicRoutes = [
  '/api/auth',
  '/_next',
  '/favicon.ico',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth check if disabled
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow static files
  if (pathname.includes('.') && !pathname.endsWith('.tsx') && !pathname.endsWith('.ts')) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get('auth_token')?.value;

  if (!token || !validateSession(token)) {
    // For API routes, return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', authenticated: false },
        { status: 401 }
      );
    }

    // For the main page, let it load - the React code handles showing login modal
    // Only redirect non-root pages to root with login param
    if (pathname !== '/') {
      return NextResponse.redirect(new URL('/?login=required', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

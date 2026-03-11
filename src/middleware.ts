import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Note: We don't check auth in middleware because Next.js Edge runtime
// doesn't share memory with Node.js runtime where sessions are stored.
// Auth is handled at the API level and frontend level.

export function middleware(request: NextRequest) {
  // Just pass through - auth is handled by:
  // 1. API routes return 401 if not authenticated
  // 2. Frontend shows login modal if not authenticated
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

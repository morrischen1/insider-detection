import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// No authentication required for general access
// Auth is only needed for auto-trading features (handled at API level)

export function middleware(request: NextRequest) {
  // Pass through all requests - dashboard is public on local network
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

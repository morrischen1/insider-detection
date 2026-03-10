import { NextResponse } from 'next/server';
import {
  verifyPassword,
  createSession,
  validateSession,
  invalidateSession,
  isAuthEnabled,
} from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, password, token } = body;

    // Check if auth is enabled
    if (!isAuthEnabled()) {
      return NextResponse.json({
        success: true,
        authenticated: true,
        message: 'Authentication disabled',
      });
    }

    // Login
    if (action === 'login') {
      if (!password) {
        return NextResponse.json(
          { success: false, error: 'Password required' },
          { status: 400 }
        );
      }

      const isValid = await verifyPassword(password);

      if (!isValid) {
        return NextResponse.json(
          { success: false, error: 'Invalid password' },
          { status: 401 }
        );
      }

      const sessionToken = createSession();

      const response = NextResponse.json({
        success: true,
        message: 'Logged in successfully',
      });

      // Set HTTP-only cookie
      response.cookies.set('auth_token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      });

      return response;
    }

    // Logout
    if (action === 'logout') {
      const cookieToken = request.headers
        .get('cookie')
        ?.split(';')
        .find(c => c.trim().startsWith('auth_token='))
        ?.split('=')[1];

      if (cookieToken) {
        invalidateSession(cookieToken);
      }

      const response = NextResponse.json({
        success: true,
        message: 'Logged out successfully',
      });

      response.cookies.delete('auth_token');

      return response;
    }

    // Check auth status
    if (action === 'check') {
      const cookieToken = request.headers
        .get('cookie')
        ?.split(';')
        .find(c => c.trim().startsWith('auth_token='))
        ?.split('=')[1];

      if (!cookieToken || !validateSession(cookieToken)) {
        return NextResponse.json({
          success: true,
          authenticated: false,
        });
      }

      return NextResponse.json({
        success: true,
        authenticated: true,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const cookieToken = request.headers
    .get('cookie')
    ?.split(';')
    .find(c => c.trim().startsWith('auth_token='))
    ?.split('=')[1];

  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: true });
  }

  const authenticated = cookieToken ? validateSession(cookieToken) : false;

  return NextResponse.json({
    authenticated,
    authEnabled: isAuthEnabled(),
  });
}

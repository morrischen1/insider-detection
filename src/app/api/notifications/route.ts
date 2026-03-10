import { NextResponse } from 'next/server';
import {
  configureNotification,
  getNotificationSettings,
  testNotification,
} from '@/lib/notifications';
import type { NotificationType } from '@/types';

export async function GET() {
  try {
    const settings = getNotificationSettings();

    return NextResponse.json({
      success: true,
      data: settings,
      timestamp: new Date(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, type, config } = body;

    if (action === 'test') {
      const result = await testNotification(type as NotificationType);
      return NextResponse.json({
        success: result.success,
        error: result.error,
        timestamp: new Date(),
      });
    }

    if (action === 'configure') {
      configureNotification({
        type: type as NotificationType,
        config,
      });

      return NextResponse.json({
        success: true,
        message: 'Notification settings saved',
        timestamp: new Date(),
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
        timestamp: new Date(),
      },
      { status: 500 }
    );
  }
}

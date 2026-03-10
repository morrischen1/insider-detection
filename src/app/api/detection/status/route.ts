import { NextResponse } from 'next/server';
import { getAllEngineStates, getConfig } from '@/lib/detection/engine';

export async function GET() {
  try {
    const states = getAllEngineStates();
    const config = getConfig();

    return NextResponse.json({
      success: true,
      data: {
        engines: states,
        config,
      },
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

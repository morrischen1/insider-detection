/**
 * Graceful Shutdown Handler
 * Ensures all resources are properly cleaned up on application shutdown
 */

import { cleanup as cleanupDetectionEngine } from '@/lib/detection/engine';
import { cleanup as cleanupNotifications } from '@/lib/notifications';
import { stopApiLogCleanup, cleanup as cleanupApiLogger } from '@/lib/logger/api';
import { cleanup as cleanupSystemLogger } from '@/lib/logger/system';
import { cleanup as cleanupAutoTrade } from '@/lib/autotrade/executor';
import { cleanup as cleanupGammaClient } from '@/lib/polymarket/gamma';
import { cleanup as cleanupDataClient } from '@/lib/polymarket/data';
import { cleanup as cleanupKalshiClient } from '@/lib/kalshi/client';
import { closeDatabase } from '@/lib/db';

type ShutdownHandler = () => void | Promise<void>;

interface ShutdownOptions {
  timeout?: number; // Maximum time to wait for cleanup (default: 5000ms)
  forceExit?: boolean; // Whether to force exit after timeout
}

const shutdownHandlers: ShutdownHandler[] = [];
let isShuttingDown = false;

/**
 * Register a shutdown handler
 */
export function registerShutdownHandler(handler: ShutdownHandler): void {
  shutdownHandlers.push(handler);
}

/**
 * Execute all shutdown handlers
 */
async function executeShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log('Already shutting down, ignoring additional signal');
    return;
  }

  isShuttingDown = true;
  console.log(`\nReceived ${signal}, starting graceful shutdown...`);

  const shutdownPromises = shutdownHandlers.map(async (handler) => {
    try {
      await handler();
    } catch (error) {
      console.error('Error during shutdown handler:', error);
    }
  });

  // Wait for all handlers with timeout
  await Promise.all(shutdownPromises);

  console.log('Graceful shutdown completed');
}

/**
 * Initialize shutdown handlers for the application
 */
export function initializeShutdownHandlers(options: ShutdownOptions = {}): void {
  const { timeout = 5000, forceExit = true } = options;

  // Register default cleanup handlers in reverse order of initialization
  registerShutdownHandler(async () => {
    console.log('Stopping detection engine...');
    cleanupDetectionEngine();
  });

  registerShutdownHandler(async () => {
    console.log('Stopping API log cleanup...');
    stopApiLogCleanup();
    cleanupApiLogger();
  });

  registerShutdownHandler(async () => {
    console.log('Cleaning up system logger...');
    cleanupSystemLogger();
  });

  registerShutdownHandler(async () => {
    console.log('Cleaning up notifications...');
    cleanupNotifications();
  });

  registerShutdownHandler(async () => {
    console.log('Cleaning up auto-trade executor...');
    cleanupAutoTrade();
  });

  registerShutdownHandler(async () => {
    console.log('Cleaning up Polymarket clients...');
    cleanupGammaClient();
    cleanupDataClient();
  });

  registerShutdownHandler(async () => {
    console.log('Cleaning up Kalshi client...');
    cleanupKalshiClient();
  });

  registerShutdownHandler(async () => {
    console.log('Closing database...');
    closeDatabase();
  });

  // Handle various shutdown signals
  const handleShutdown = (signal: string) => {
    const timeoutId = setTimeout(() => {
      console.log('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, timeout);

    executeShutdown(signal)
      .then(() => {
        clearTimeout(timeoutId);
        if (forceExit) {
          process.exit(0);
        }
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        console.error('Error during shutdown:', error);
        if (forceExit) {
          process.exit(1);
        }
      });
  };

  // Register signal handlers
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    handleShutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
  });

  console.log('Shutdown handlers initialized');
}

/**
 * Get current shutdown state
 */
export function isShuttingDownState(): boolean {
  return isShuttingDown;
}

/**
 * Memory monitoring utility
 */
export function startMemoryMonitoring(intervalMs: number = 60000): NodeJS.Timeout {
  const interval = setInterval(() => {
    const usage = process.memoryUsage();
    console.log('Memory usage:', {
      rss: `${(usage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      external: `${(usage.external / 1024 / 1024).toFixed(2)} MB`,
    });
  }, intervalMs);

  // Don't prevent the process from exiting
  if (interval.unref) {
    interval.unref();
  }

  return interval;
}

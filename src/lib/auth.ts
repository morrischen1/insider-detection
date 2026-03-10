/**
 * Simple Authentication System
 * Password-based authentication for local network access
 */

import bcrypt from 'bcryptjs';

// Session storage (in-memory, resets on server restart)
const sessions = new Map<string, { createdAt: Date; expiresAt: Date }>();
const SESSION_DURATION_HOURS = 24;

// Get admin password from environment or use default (should be changed!)
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

// Hash the password on startup
let passwordHash: string | null = null;

async function getPasswordHash(): Promise<string> {
  if (passwordHash) return passwordHash;

  if (ADMIN_PASSWORD_HASH) {
    passwordHash = ADMIN_PASSWORD_HASH;
  } else {
    // Hash the plaintext password
    passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  }

  return passwordHash;
}

/**
 * Verify password
 */
export async function verifyPassword(password: string): Promise<boolean> {
  const hash = await getPasswordHash();
  return bcrypt.compare(password, hash);
}

/**
 * Generate a session token
 */
export function createSession(): string {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000);

  sessions.set(token, { createdAt: now, expiresAt });

  return token;
}

/**
 * Validate a session token
 */
export function validateSession(token: string): boolean {
  const session = sessions.get(token);

  if (!session) return false;

  if (new Date() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }

  return true;
}

/**
 * Invalidate a session (logout)
 */
export function invalidateSession(token: string): void {
  sessions.delete(token);
}

/**
 * Clean up expired sessions
 */
export function cleanupSessions(): number {
  const now = new Date();
  let cleaned = 0;

  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Check if authentication is enabled
 */
export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED !== 'false';
}

/**
 * Generate a password hash for .env
 * Run this to generate a hash for your password
 */
export async function generatePasswordHash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Clean up sessions every hour
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupSessions, 60 * 60 * 1000);
}

/**
 * Simple Authentication System
 * Password-based authentication for local network access
 * Sessions stored in SQLite database for persistence across restarts
 */

import bcrypt from 'bcryptjs';
import { db } from './db';

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

  const now = Date.now();
  const expiresAt = now + SESSION_DURATION_HOURS * 60 * 60 * 1000;

  // Store session in database
  try {
    const stmt = db.prepare(`
      INSERT INTO sessions (id, created_at, expires_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(token, now, expiresAt);
  } catch (error) {
    console.error('Failed to create session:', error);
  }

/**
 * Validate a session token
 */
export function validateSession(token: string): boolean {
    try {
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    const session = stmt.get(token) as { id: string; created_at: number; expires_at: number } | undefined;

    if (!session) return false;

    if (Date.now() > session.expires_at) {
      // Delete expired session
      const deleteStmt = db.prepare('DELETE FROM sessions WHERE id = ?');
      deleteStmt.run(token);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to validate session:', error);
    return false;
  }
}

/**
 * Invalidate a session (logout)
 */
export function invalidateSession(token: string): void {
  try {
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(token);
  } catch (error) {
    console.error('Failed to invalidate session:', error);
  }
}

/**
 * Clean up expired sessions
 */
export function cleanupSessions(): number {
  try {
    const now = Date.now();
    const stmt = db.prepare('DELETE FROM sessions WHERE expires_at < ?');
    const result = stmt.run(now);
    return result.changes;
  } catch (error) {
    console.error('Failed to cleanup sessions:', error);
    return 0;
  }
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

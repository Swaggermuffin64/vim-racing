/**
 * Match Token Authentication
 *
 * Verifies short-lived JWTs issued by the matchmaking service for
 * quick-match connections. Private room connections (direct) are
 * allowed without a token — rate and connection limiters handle abuse.
 */

import jwt from 'jsonwebtoken';
import { MATCH_TOKEN_SECRET } from '../config.js';

export interface MatchTokenPayload {
  playerId: string;
  roomId: string;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

if (!MATCH_TOKEN_SECRET) {
  console.warn('⚠️ MATCH_TOKEN_SECRET not set — match token verification disabled (dev only)');
}

/**
 * Verify a match token signed by the matchmaking service.
 * When no token is provided (private room / local dev), generates a
 * local user ID and allows the connection.
 */
export function verifyMatchToken(token: string | undefined): AuthResult {
  if (!token) {
    return {
      success: true,
      userId: `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }

  if (!MATCH_TOKEN_SECRET) {
    // Dev mode: accept token without verification, extract payload
    try {
      const decoded = jwt.decode(token);
      if (decoded && typeof decoded === 'object' && 'playerId' in decoded) {
        return { success: true, userId: (decoded as MatchTokenPayload).playerId };
      }
    } catch { /* fall through */ }
    return {
      success: true,
      userId: `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }

  try {
    const payload = jwt.verify(token, MATCH_TOKEN_SECRET) as MatchTokenPayload;
    if (!payload.playerId) {
      return { success: false, error: 'Token missing player ID' };
    }
    return { success: true, userId: payload.playerId };
  } catch {
    return { success: false, error: 'Invalid or expired match token' };
  }
}

/**
 * Extract auth token from Socket.IO handshake
 */
export function extractTokenFromHandshake(handshake: { auth?: { token?: string } }): string | undefined {
  return handshake?.auth?.token;
}

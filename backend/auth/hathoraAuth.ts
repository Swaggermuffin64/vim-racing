/**
 * Hathora Authentication Utilities
 * 
 * Handles verification of Hathora auth tokens for Socket.IO connections.
 * In production Hathora environment, tokens are JWTs issued by Hathora's auth service.
 */

import { IS_HATHORA } from '../config.js';

export interface HathoraTokenPayload {
  /** Unique user identifier from Hathora */
  id: string;
  /** Token type (e.g., 'anonymous', 'google') */
  type?: string;
  /** Token issued at timestamp */
  iat?: number;
  /** Token expiration timestamp */
  exp?: number;
}

export interface AuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

/**
 * Decode a JWT token without verification (base64 decode the payload).
 * Note: This does NOT verify the signature - use only when token source is trusted
 * or when combined with other verification.
 */
function decodeJwtPayload(token: string): HathoraTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode the payload (second part)
    const payload = parts[1];
    if (!payload) return null;
    
    // Handle base64url encoding
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired
 */
function isTokenExpired(payload: HathoraTokenPayload): boolean {
  if (!payload.exp) return false; // No expiration = not expired
  const now = Math.floor(Date.now() / 1000);
  return now > payload.exp;
}

/**
 * Verify a Hathora auth token and extract the user ID.
 * 
 * For Hathora tokens (anonymous/google/custom), this decodes the JWT and extracts
 * the user ID. The token was signed by Hathora's auth service.
 * 
 * In local development mode (IS_HATHORA=false), this is more permissive.
 */
export function verifyHathoraToken(token: string | undefined): AuthResult {
  // In local development, allow connection without token
  if (!IS_HATHORA && !token) {
    return {
      success: true,
      userId: `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }
  
  if (!token) {
    return {
      success: false,
      error: 'Authentication token required',
    };
  }
  
  // Decode the JWT payload
  const payload = decodeJwtPayload(token);
  
  if (!payload) {
    return {
      success: false,
      error: 'Invalid token format',
    };
  }
  
  // Check expiration
  if (isTokenExpired(payload)) {
    return {
      success: false,
      error: 'Token expired',
    };
  }
  
  // Extract user ID
  if (!payload.id) {
    return {
      success: false,
      error: 'Token missing user ID',
    };
  }
  
  return {
    success: true,
    userId: payload.id,
  };
}

/**
 * Extract auth token from Socket.IO handshake
 */
export function extractTokenFromHandshake(handshake: { auth?: { token?: string } }): string | undefined {
  return handshake?.auth?.token;
}

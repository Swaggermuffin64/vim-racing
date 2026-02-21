/**
 * Hathora Authentication Utilities for Matchmaking Service
 * 
 * Verifies Hathora auth tokens using cryptographic JWT signature validation.
 * Requires HATHORA_APP_SECRET to be set for production use.
 */

import jwt from 'jsonwebtoken';

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

const APP_SECRET = process.env.HATHORA_APP_SECRET;

if (!APP_SECRET && (process.env.NODE_ENV === 'production' || process.env.REQUIRE_AUTH === 'true')) {
  console.error('❌ HATHORA_APP_SECRET is required in production for JWT signature verification');
  process.exit(1);
}

if (!APP_SECRET) {
  console.warn('⚠️ HATHORA_APP_SECRET not set — falling back to unverified JWT decode (dev only)');
}

/**
 * Verify a JWT token's signature using the Hathora app secret.
 * Falls back to unsigned decode only in development when no secret is configured.
 */
function verifyAndDecodeToken(token: string): HathoraTokenPayload | null {
  if (APP_SECRET) {
    try {
      const payload = jwt.verify(token, APP_SECRET);
      if (typeof payload === 'object' && payload !== null && 'id' in payload) {
        return payload as HathoraTokenPayload;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Dev-only fallback: decode without signature verification
  return decodeJwtPayloadUnsafe(token);
}

/**
 * Decode a JWT payload without verifying the signature.
 * ONLY used in development when HATHORA_APP_SECRET is not configured.
 */
function decodeJwtPayloadUnsafe(token: string): HathoraTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    if (!payload) return null;

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');
    const parsed = JSON.parse(jsonPayload);

    if (parsed.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (now > parsed.exp) return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Verify a Hathora auth token and extract the user ID.
 * 
 * When HATHORA_APP_SECRET is set, performs full cryptographic verification
 * (signature + expiration). In development without a secret, falls back to
 * unsigned decode with manual expiration check.
 */
export function verifyToken(token: string | undefined, requireAuth: boolean = true): AuthResult {
  if (!token) {
    if (requireAuth) {
      return { success: false, error: 'Authentication token required' };
    }
    return {
      success: true,
      userId: `anon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }

  const payload = verifyAndDecodeToken(token);

  if (!payload) {
    return { success: false, error: 'Invalid or tampered token' };
  }

  if (!payload.id) {
    return { success: false, error: 'Token missing user ID' };
  }

  return { success: true, userId: payload.id };
}

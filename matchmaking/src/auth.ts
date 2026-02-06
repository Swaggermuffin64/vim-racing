/**
 * Hathora Authentication Utilities for Matchmaking Service
 * 
 * Handles verification of Hathora auth tokens.
 */

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
 * Note: This does NOT verify the signature - use only when token source is trusted.
 */
function decodeJwtPayload(token: string): HathoraTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
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
  if (!payload.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return now > payload.exp;
}

/**
 * Verify a Hathora auth token and extract the user ID.
 * 
 * @param token - The Hathora auth token
 * @param requireAuth - If true, reject missing tokens. If false, allow unauthenticated.
 */
export function verifyToken(token: string | undefined, requireAuth: boolean = true): AuthResult {
  if (!token) {
    if (requireAuth) {
      return {
        success: false,
        error: 'Authentication token required',
      };
    }
    // Allow unauthenticated connections when not required
    return {
      success: true,
      userId: `anon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    };
  }
  
  const payload = decodeJwtPayload(token);
  
  if (!payload) {
    return {
      success: false,
      error: 'Invalid token format',
    };
  }
  
  if (isTokenExpired(payload)) {
    return {
      success: false,
      error: 'Token expired',
    };
  }
  
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

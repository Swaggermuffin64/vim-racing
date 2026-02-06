/**
 * Input Validation Utilities
 * 
 * Provides validation and sanitization for all user inputs to prevent
 * XSS, injection attacks, and malformed data.
 */

import { IS_HATHORA } from '../config.js';

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  error?: string;
}

// Limits
const PLAYER_NAME_MAX_LENGTH = 20;
const PLAYER_NAME_MIN_LENGTH = 1;
const ROOM_ID_LENGTH = 6;
const MAX_EDITOR_TEXT_LENGTH = 10000; // 10KB max for editor content
const MAX_CURSOR_OFFSET = 100000;     // Reasonable max for any code file

/**
 * Sanitize and validate a player name.
 * - Trims whitespace
 * - Limits length
 * - Removes potentially dangerous characters (HTML/script injection)
 * - Returns default if empty
 */
export function validatePlayerName(input: unknown): ValidationResult<string> {
  // Type check
  if (typeof input !== 'string') {
    return { valid: true, value: 'Player' };
  }

  // Trim and limit length
  let name = input.trim().slice(0, PLAYER_NAME_MAX_LENGTH);

  // Remove potentially dangerous characters (XSS prevention)
  // Allow: letters, numbers, spaces, underscores, hyphens, and some common symbols
  name = name.replace(/[<>'"&\\]/g, '');

  // Remove control characters
  name = name.replace(/[\x00-\x1F\x7F]/g, '');

  // Ensure minimum length
  if (name.length < PLAYER_NAME_MIN_LENGTH) {
    name = 'Player';
  }

  return { valid: true, value: name };
}

/**
 * Validate a room ID format.
 * - In development: accepts 6 char alphanumeric (internal format)
 * - In production (Hathora): only accepts Hathora room ID format
 */
export function validateRoomId(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { valid: false, error: 'Room ID must be a string' };
  }

  const trimmed = input.trim();

  // Check for Hathora room ID format (UUID-like)
  // Hathora uses format like: 2swovpy1zbfwf (lowercase alphanumeric, ~13 chars)
  const hathoraFormat = /^[a-z0-9]{10,20}$/i;
  if (hathoraFormat.test(trimmed)) {
    return { valid: true, value: trimmed };
  }

  // Internal room ID format (6 char alphanumeric) - only allowed in development
  if (!IS_HATHORA) {
    const internalFormat = /^[A-Z0-9]{6}$/;
    const roomId = trimmed.toUpperCase();
    if (internalFormat.test(roomId)) {
      return { valid: true, value: roomId };
    }
  }

  return { valid: false, error: 'Invalid room ID format' };
}

/**
 * Validate cursor offset.
 * Must be a non-negative integer within reasonable bounds.
 */
export function validateCursorOffset(input: unknown): ValidationResult<number> {
  if (typeof input !== 'number') {
    return { valid: false, error: 'Cursor offset must be a number' };
  }

  if (!Number.isInteger(input)) {
    return { valid: false, error: 'Cursor offset must be an integer' };
  }

  if (input < 0) {
    return { valid: false, error: 'Cursor offset cannot be negative' };
  }

  if (input > MAX_CURSOR_OFFSET) {
    return { valid: false, error: 'Cursor offset exceeds maximum' };
  }

  return { valid: true, value: input };
}

/**
 * Validate editor text content.
 * Must be a string within size limits.
 */
export function validateEditorText(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { valid: false, error: 'Editor text must be a string' };
  }

  if (input.length > MAX_EDITOR_TEXT_LENGTH) {
    return { valid: false, error: 'Editor text exceeds maximum length' };
  }

  return { valid: true, value: input };
}

/**
 * Validate boolean input.
 * Coerces to boolean, defaults to false if not provided.
 */
export function validateBoolean(input: unknown, defaultValue: boolean = false): ValidationResult<boolean> {
  if (input === undefined || input === null) {
    return { valid: true, value: defaultValue };
  }

  return { valid: true, value: Boolean(input) };
}

/**
 * Validate optional room ID (for room creation where ID might not be provided).
 */
export function validateOptionalRoomId(input: unknown): ValidationResult<string | undefined> {
  if (input === undefined || input === null || input === '') {
    return { valid: true, value: undefined };
  }

  const result = validateRoomId(input);
  if (!result.valid) {
    return result as ValidationResult<string | undefined>;
  }

  return { valid: true, value: result.value };
}

/**
 * Combined validation helper for common socket event data.
 * Returns sanitized data or throws with error message.
 */
export const validators = {
  playerName: validatePlayerName,
  roomId: validateRoomId,
  optionalRoomId: validateOptionalRoomId,
  cursorOffset: validateCursorOffset,
  editorText: validateEditorText,
  boolean: validateBoolean,
};

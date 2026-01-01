// Environment configuration

// Detect Hathora environment - HATHORA_PROCESS_ID is always set in Hathora
export const IS_HATHORA = !!process.env.HATHORA_PROCESS_ID;

// Port configuration
export const BACKEND_PORT = parseInt(
  process.env.HATHORA_PORT || process.env.PORT || process.env.BACKEND_PORT || '3001',
  10
);

// CORS origins - add your production frontend URL to FRONTEND_URL env var
// FRONTEND_URL can be comma-separated for multiple origins
export const CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(url => url.trim()) : []),
];


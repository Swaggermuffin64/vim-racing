/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_HATHORA: string
  readonly VITE_BACKEND_URL: string
  readonly VITE_HATHORA_APP_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}


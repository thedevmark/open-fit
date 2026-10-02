/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of your deployed sync worker (sync/), e.g. https://fit-sync.example.workers.dev */
  readonly VITE_SYNC_URL?: string;
}

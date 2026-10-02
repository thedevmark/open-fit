// Per-deployment settings. Change these for your own copy; nothing else in
// the app knows where it is running. Sync stays off until you deploy the
// worker in sync/ and set VITE_SYNC_URL (see README).

export interface FitConfig {
  /** Where the app is served from, with trailing slash. Icons, how-to photos and the service worker live under it. */
  base: string;
  /** Lock the gym name and hide the field. null = people name their own gym. */
  club: string | null;
  /** New installs count the trip to the gym (rode / ran / walked) as leg fatigue. */
  trips: boolean;
  /** Sync worker URL (no trailing slash). null hides sync entirely. */
  syncUrl: string | null;
  /** IndexedDB name. Changing it on a live deployment strands everyone's data. */
  dbName: string;
}

export const FIT_CONFIG: FitConfig = {
  base: import.meta.env.BASE_URL,
  club: null,
  trips: true,
  syncUrl: import.meta.env.VITE_SYNC_URL || null,
  dbName: "open-fit",
};

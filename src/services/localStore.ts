/**
 * Small persistence boundary for the browser-only release.
 * Replace this adapter with a fetch-backed API repository when the FastAPI
 * service is introduced. Keeping I/O out of the React views makes that swap
 * independent of the study planning and assessment models.
 */
export interface Store<T> {
  read: () => T;
  write: (value: T) => void;
  clear: () => void;
}

export function createBrowserStore<T>(
  key: string,
  defaults: T,
  normalize: (parsed: T) => T = parsed => parsed,
): Store<T> {
  return {
    read() {
      try {
        const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
        return raw ? normalize(JSON.parse(raw) as T) : defaults;
      } catch {
        return defaults;
      }
    },
    write(value) {
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // The app remains usable in private browsing or when storage is full.
      }
    },
    clear() {
      try { if (typeof window !== 'undefined') window.localStorage.removeItem(key); }
      catch { /* The app remains usable if browser storage is unavailable. */ }
    },
  };
}

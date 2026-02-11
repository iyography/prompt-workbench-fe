// Simple in-memory TTL cache using globalThis to persist between route invocations
// Not for sensitive data. Suitable for short-lived caching of Apify results.

type CacheEntry<T> = { value: T; expiresAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __APIFY_CACHE__: Map<string, CacheEntry<any>> | undefined;
}

const store: Map<string, CacheEntry<any>> = globalThis.__APIFY_CACHE__ || new Map();
if (!globalThis.__APIFY_CACHE__) globalThis.__APIFY_CACHE__ = store;

export function getCache<T = any>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCache<T = any>(key: string, value: T, ttlMs: number) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheKeyFromParts(parts: Record<string, unknown>): string {
  return Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('|');
} 
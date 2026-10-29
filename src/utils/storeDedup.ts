export const STORE_NAMES = ['YXIG店', 'Yxig店', 'Hidden Power Clothing'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return (parsed.hostname + parsed.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return String(url || '').split('?')[0].trim().toLowerCase();
  }
}

export async function readStoreHistory(storeName: StoreName): Promise<string[]> {
  return readStoreHistoryInternal(storeName);
}

const STORE_HISTORY_CACHE_MS = 5 * 60 * 1000;
const storeHistoryCache = new Map<StoreName, { urls: string[]; expiresAt: number }>();
const storeHistoryRequests = new Map<StoreName, Promise<string[]>>();

export async function readStoreHistorySafe(storeName: StoreName): Promise<string[]> {
  try {
    return await readStoreHistory(storeName);
  } catch (error) {
    console.warn('读取店铺去重历史失败，本次导出按未去重继续:', error);
    return [];
  }
}

async function readStoreHistoryInternal(storeName: StoreName): Promise<string[]> {
  const cached = storeHistoryCache.get(storeName);
  if (cached && cached.expiresAt > Date.now()) return cached.urls;
  const pending = storeHistoryRequests.get(storeName);
  if (pending) return pending;
  const request = (async () => {
  const response = await fetch('/api/cos/store-links/read?storeName=' + encodeURIComponent(storeName), {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || '读取店铺去重历史失败');
  }
  const result = await response.json();
    const urls = Array.isArray(result.urls) ? result.urls.map((url: unknown) => String(url || '')) : [];
    storeHistoryCache.set(storeName, { urls, expiresAt: Date.now() + STORE_HISTORY_CACHE_MS });
    return urls;
  })().finally(() => storeHistoryRequests.delete(storeName));
  storeHistoryRequests.set(storeName, request);
  return request;
}

export async function saveStoreHistory(storeName: StoreName, urls: string[]): Promise<void> {
  if (!urls.length) return;
  const response = await fetch('/api/cos/store-links/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeName, urls }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw new Error(result.error || '保存店铺去重历史失败');
  storeHistoryCache.delete(storeName);
}

export function filterDuplicateUrls<T>(items: T[], getUrl: (item: T) => string, knownUrls: string[]) {
  const known = new Set(knownUrls.map(normalizeSourceUrl));
  const seen = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const key = normalizeSourceUrl(getUrl(item));
    if (!key) return true;
    if (known.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { uniqueItems, duplicateCount: items.length - uniqueItems.length };
}

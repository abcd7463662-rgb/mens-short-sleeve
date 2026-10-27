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
  const response = await fetch('/api/cos/store-links/read?storeName=' + encodeURIComponent(storeName));
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || '读取店铺去重历史失败');
  }
  const result = await response.json();
  return Array.isArray(result.urls) ? result.urls.map((url: unknown) => String(url || '')) : [];
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

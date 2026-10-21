/**
 * 谷歌翻译客户端封装工具
 *
 * 优先在浏览器里直连谷歌公开接口：云端服务器（Render 等）的出口 IP 很容易被
 * 谷歌整体限流（直接 429），而用户自己浏览器的 IP 通常可用。直连失败时才回退
 * 到 /api/translate，两条路都走不通才报告失败。
 */

import { cleanChineseTitle, cleanEnglishTitle } from './titleCleaner';

export interface TranslationResponse {
  success: boolean;
  translation?: string;
  translations?: string[];
  originalText?: string;
  failedIndexes?: number[];
  error?: string;
}

const GOOGLE_GTX = 'https://translate.googleapis.com/translate_a/single';
const GOOGLE_DICT = 'https://clients5.google.com/translate_a/t';

// 浏览器侧并发上限。实测同一 IP 并行 8 个请求会被谷歌 429，2 个稳定。
const MAX_CONCURRENT = 2;
const REQUEST_TIMEOUT_MS = 15000;

let activeRequests = 0;
const waitingSlots: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeRequests >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waitingSlots.push(resolve));
  } else {
    activeRequests += 1;
  }
  try {
    return await task();
  } finally {
    const next = waitingSlots.shift();
    if (next) next();
    else activeRequests -= 1;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const CACHE_KEY = 'tr-en-cache-v1';
const CACHE_LIMIT = 3000;

function loadCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, string>) {
  try {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_LIMIT) {
      for (const key of keys.slice(0, keys.length - CACHE_LIMIT)) delete cache[key];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 配额满了就放弃缓存，不影响翻译本身
  }
}

async function callGoogleDirect(
  text: string,
  targetLang: string,
  endpoint: 'gtx' | 'dict'
): Promise<string | null> {
  const url =
    endpoint === 'gtx'
      ? `${GOOGLE_GTX}?client=gtx&sl=auto&tl=${encodeURIComponent(
          targetLang
        )}&dt=t&q=${encodeURIComponent(text)}`
      : `${GOOGLE_DICT}?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(
          targetLang
        )}&q=${encodeURIComponent(text)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) return null;

  const data: any = await res.json();

  if (endpoint === 'gtx') {
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    const joined = data[0]
      .map((segment: any) => (Array.isArray(segment) ? segment[0] : ''))
      .join('')
      .trim();
    return joined ? cleanEnglishTitle(joined) || null : null;
  }

  if (Array.isArray(data) && typeof data[0] === 'string' && data[0].trim()) {
    return cleanEnglishTitle(data[0].trim()) || null;
  }
  return null;
}

/** 浏览器直连谷歌，失败返回 null */
async function translateInBrowser(text: string, targetLang: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(350 * attempt + Math.random() * 200);
    for (const endpoint of ['gtx', 'dict'] as const) {
      try {
        const result = await withSlot(() => callGoogleDirect(text, targetLang, endpoint));
        if (result) return result;
      } catch {
        // 网络错误或被限流，换下一个入口
      }
    }
  }
  return null;
}

/** 服务器兜底：单条 */
async function translateOnServer(text: string, targetLang: string): Promise<string | null> {
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetLang }),
    });
    if (!res.ok) return null;
    const data: TranslationResponse = await res.json();
    const value = data?.success && data.translation ? data.translation.trim() : '';
    return value ? cleanEnglishTitle(value) || null : null;
  } catch {
    return null;
  }
}

/** 单条翻译：浏览器直连 → 服务器 */
async function translateOne(text: string, targetLang: string, cache: Record<string, string>) {
  const key = `${targetLang}::${text}`;
  if (cache[key]) return cache[key];

  const direct = await translateInBrowser(text, targetLang);
  if (direct) {
    cache[key] = direct;
    return direct;
  }

  const fromServer = await translateOnServer(text, targetLang);
  if (fromServer) {
    cache[key] = fromServer;
    return fromServer;
  }

  return null;
}

/**
 * 将单个商品标题通过谷歌翻译 API 翻译为英文
 * 自动剔除中文标题中的「舒适色彩」、「棉」以及英文标题中的「Comfort Colors」、「Cotton」
 */
export async function translateTitleWithGoogle(
  title: string,
  targetLang: string = 'en'
): Promise<{ translatedText: string; rawResponse?: any }> {
  const cleanedInput = cleanChineseTitle(title || '');
  if (!cleanedInput) return { translatedText: '' };

  const cache = loadCache();
  const translated = await translateOne(cleanedInput, targetLang, cache);
  saveCache(cache);

  return { translatedText: translated || cleanEnglishTitle(cleanedInput) };
}

/**
 * 批量将多个商品标题通过谷歌翻译 API 翻译为英文
 * 自动剔除「舒适色彩」、「棉」和「Comfort Colors」、「Cotton」
 */
export async function translateBatchTitlesWithGoogle(
  titles: string[],
  targetLang: string = 'en',
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  if (!titles || titles.length === 0) return [];

  const cleanedTitles = titles.map((t) => cleanChineseTitle(t || ''));

  // A sheet repeats the same title across colors and sizes, so dedupe before
  // hitting the network and fan the answers back out at the end.
  const uniqueTitles: string[] = [];
  const seen = new Set<string>();
  for (const t of cleanedTitles) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    uniqueTitles.push(t);
  }

  const resolved = new Map<string, string>();
  const cache = loadCache();

  let completed = 0;
  for (const title of uniqueTitles) {
    const value = await translateOne(title, targetLang, cache);
    if (value) resolved.set(title, cleanEnglishTitle(value));
    completed += 1;
    if (onProgress) onProgress(completed, uniqueTitles.length);
  }

  saveCache(cache);

  return cleanedTitles.map((t) => (t ? resolved.get(t) || '' : ''));
}

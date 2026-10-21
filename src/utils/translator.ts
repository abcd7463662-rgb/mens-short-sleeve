/**
 * 谷歌翻译客户端封装工具
 * 支持单个商品标题翻译与批量异步并发翻译
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

  let translated = '';
  let rawResponse = null;

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanedInput, targetLang }),
    });

    if (res.ok) {
      const data: TranslationResponse = await res.json();
      rawResponse = data;
      if (data.success && data.translation) {
        translated = data.translation.trim();
      }
    }
  } catch (err) {
    console.warn('Backend translation failed:', err);
  }

  return { translatedText: cleanEnglishTitle(translated || cleanedInput), rawResponse };
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

  const requestBatch = async (batch: string[]): Promise<TranslationResponse | null> => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: batch, targetLang }),
      });
      if (!res.ok) return null;
      return (await res.json()) as TranslationResponse;
    } catch (err) {
      console.warn('Batch translate endpoint error:', err);
      return null;
    }
  };

  // The server caps its own throughput, but very long sheets still benefit from
  // being split so one slow stretch cannot blow a single request's time budget.
  const BATCH_SIZE = 40;
  for (let i = 0; i < uniqueTitles.length; i += BATCH_SIZE) {
    const batch = uniqueTitles.slice(i, i + BATCH_SIZE);
    const data = await requestBatch(batch);

    if (data?.success && Array.isArray(data.translations)) {
      batch.forEach((title, idx) => {
        const value = data.translations?.[idx];
        if (value) resolved.set(title, cleanEnglishTitle(value));
      });
    }

    if (onProgress) onProgress(Math.min(i + BATCH_SIZE, uniqueTitles.length), uniqueTitles.length);
  }

  // Anything the batches could not fill is retried one at a time. Going through
  // the single-text path gives each title its own retry budget.
  const missing = uniqueTitles.filter((t) => !resolved.has(t));
  for (const title of missing) {
    const single = await translateTitleWithGoogle(title, targetLang);
    const value = cleanEnglishTitle(single.translatedText);
    if (value && value !== title) resolved.set(title, value);
  }

  return cleanedTitles.map((t) => resolved.get(t) || '');
}

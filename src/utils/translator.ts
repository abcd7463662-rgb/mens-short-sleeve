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

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: cleanedTitles, targetLang }),
    });

    if (res.ok) {
      const data: TranslationResponse = await res.json();
      if (data.success && Array.isArray(data.translations)) {
        if (onProgress) onProgress(titles.length, titles.length);
        return data.translations.map((trans) => cleanEnglishTitle(trans));
      }
    }
  } catch (err) {
    console.warn('Batch translate endpoint error, falling back to sequential translation:', err);
  }

  // Fallback: translate one by one
  const results: string[] = [];
  for (let i = 0; i < cleanedTitles.length; i++) {
    const t = await translateTitleWithGoogle(cleanedTitles[i], targetLang);
    results.push(cleanEnglishTitle(t.translatedText));
    if (onProgress) onProgress(i + 1, titles.length);
  }
  return results;
}

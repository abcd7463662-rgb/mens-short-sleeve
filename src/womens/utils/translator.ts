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
  failedIndexes?: number[];
}

/**
 * 将单个商品标题通过谷歌翻译 API 翻译为英文
 * 自动剔除中文标题中的「舒适色彩」、「棉」以及英文标题中的「Comfort Colors」、「Cotton」
 */
export async function translateTitleWithGoogle(
  title: string,
  targetLang: string = 'en'
): Promise<string> {
  const cleanedInput = cleanChineseTitle(title || '');
  if (!cleanedInput) return '';

  let translated = '';

  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanedInput, targetLang }),
    });

    if (res.ok) {
      const data: TranslationResponse = await res.json();
      if (data.success && data.translation) {
        translated = data.translation.trim();
      }
    }
  } catch (err) {
    console.warn('Backend translate endpoint error, attempting client-side fallback:', err);
  }

  // Client-side fallback to direct Google Translate endpoints
  if (!translated) {
    try {
      const dictUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(
        targetLang
      )}&q=${encodeURIComponent(cleanedInput)}`;
      const response = await fetch(dictUrl);
      if (response.ok) {
        const data: any = await response.json();
        if (Array.isArray(data)) {
          if (Array.isArray(data[0]) && typeof data[0][0] === 'string' && data[0][0].trim()) {
            translated = data[0][0].trim();
          } else if (typeof data[0] === 'string' && data[0].trim()) {
            translated = data[0].trim();
          }
        } else if (typeof data === 'string' && data.trim()) {
          translated = data.trim();
        }
      }
    } catch {
      // Ignore and proceed to gtx
    }
  }

  if (!translated) {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
        targetLang
      )}&dt=t&q=${encodeURIComponent(cleanedInput)}`;
      const response = await fetch(url);
      if (response.ok) {
        const data: any = await response.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const fullTranslation = data[0]
            .map((segment: any) => (Array.isArray(segment) ? segment[0] : ''))
            .join('')
            .trim();
          if (fullTranslation) translated = fullTranslation;
        }
      }
    } catch (clientErr) {
      console.warn('Direct Google Translate fallback failed:', clientErr);
    }
  }

  const finalEnglish = cleanEnglishTitle(translated || cleanedInput);
  return finalEnglish;
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
        const failed = new Set(data.failedIndexes || []);
        const results: string[] = [];
        let completed = 0;
        for (let i = 0; i < cleanedTitles.length; i++) {
          const translated = failed.has(i) ? '' : cleanEnglishTitle(data.translations[i] || '');
          if (translated) {
            results.push(translated);
            completed++;
          } else {
            results.push('');
          }
          if (onProgress) onProgress(completed, titles.length);
        }
        return results;
      }
    }
  } catch (err) {
    console.warn('Batch translate endpoint error, falling back to sequential translation:', err);
  }

  // Fallback: 有限并发逐条翻译，避免大批量标题时退化成纯串行
  const results: string[] = new Array(cleanedTitles.length).fill('');
  let cursor = 0;
  let completed = 0;
  const FALLBACK_CONCURRENCY = 4;
  const worker = async () => {
    while (cursor < cleanedTitles.length) {
      const i = cursor++;
      try {
        const t = await translateTitleWithGoogle(cleanedTitles[i], targetLang);
        results[i] = cleanEnglishTitle(t);
      } catch {
        results[i] = '';
      }
      completed++;
      if (onProgress) onProgress(completed, titles.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FALLBACK_CONCURRENCY, cleanedTitles.length) }, () => worker())
  );
  return results;
}

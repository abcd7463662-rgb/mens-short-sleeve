/**
 * 商品标题敏感词/关键词自动剔除及长度限制工具
 * 规则：
 * 1. 中文标题自动剔除「舒适色彩」、「安慰色彩」、「棉」（含 纯棉、全棉、棉质、100%棉、水洗棉、重磅棉、有机棉及所有含棉词）以及「®」
 * 2. 英文标题自动剔除对应词「Comfort Colors」、「Cotton」（含 100% Cotton、Cotton Blend、Ringspun Cotton 等）以及「®」
 * 3. 中文标题和英文标题字符数均严格不能超过 250 个字符，多的从后面删除（截断）
 */

export const MAX_TITLE_LENGTH = 250;

/**
 * 截断标题，限制字符数不超过 250，多出的字符从后面删除
 */
export function truncateTitle(str: string, maxLength: number = MAX_TITLE_LENGTH): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  // 超过最大长度，多的从后面删除
  let truncated = str.slice(0, maxLength);
  // 清理截断后末尾可能残留的孤立标点或空格
  truncated = truncated.replace(/[\s,，\-—_/|]+$/g, '').trim();
  return truncated;
}

/**
 * 剔除中文标题中的「舒适色彩」、「安慰色彩」、「棉」与「®」，并限制最大 250 字符
 */
export function cleanChineseTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let title = String(rawTitle);

  // 1. 剔除注册商标符号 ® 及 (R)、（R）、™
  title = title.replace(/[®™\u00AE\u2122]/g, '');
  title = title.replace(/\([rR]\)|（[rR]）|\[[rR]\]|【[rR]】/g, '');

  // 2. 剔除「舒适色彩」、「安慰色彩」及其常见变体和对应英文（支持字符间含空格/连字符）
  title = title.replace(/舒\s*适\s*色\s*彩/gi, '');
  title = title.replace(/舒\s*适\s*颜\s*色/gi, '');
  title = title.replace(/舒\s*适\s*色/gi, '');
  title = title.replace(/安\s*慰\s*色\s*彩/gi, '');
  title = title.replace(/安\s*慰\s*颜\s*色/gi, '');
  title = title.replace(/安\s*慰\s*色/gi, '');
  title = title.replace(/\bcomfort\s*-?\s*colou?rs?\b/gi, '');
  title = title.replace(/comfortcolou?rs?/gi, '');
  title = title.replace(/\bcomfortable\s*colou?rs?\b/gi, '');

  // 3. 剔除「棉」相关词汇及英文（100%棉、纯棉、全棉、棉质、有机棉、重磅棉等）
  title = title.replace(/100%\s*(纯棉|全棉|棉质|有机棉|棉)/gi, '');
  title = title.replace(/纯棉|全棉|棉质|有机棉|涤棉|精梳棉|水洗棉|针织棉|重磅棉|丝光棉|长绒棉/gi, '');
  title = title.replace(/棉/g, ''); // 严格剔除所有「棉」字
  title = title.replace(/\b100%\s*(ringspun\s*|combed\s*|organic\s*|pure\s*|all\s*|heavyweight\s*)?cottons?\b/gi, '');
  title = title.replace(/\b(ringspun|combed|organic|pure|heavyweight)\s+cottons?\b/gi, '');
  title = title.replace(/\bcotton\s*blend\b/gi, '');
  title = title.replace(/\bcotton\s*poly\b/gi, '');
  title = title.replace(/\bcottons?\b/gi, '');

  // 4. 清理空括号及孤立多余标点
  title = title.replace(/\(\s*\)|\[\s*\]|【\s*】|（\s*）/g, '');
  title = title
    .replace(/[，,]{2,}/g, ', ')
    .replace(/[-—]{2,}/g, '-')
    .replace(/\s*[|/]\s*[|/]+/g, ' / ')
    .replace(/\s*,\s*-\s*/g, ', ')
    .replace(/\s*-\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,，\-—_/|]+|[\s,，\-—_/|]+$/g, '')
    .trim();

  // 5. 字符数不能超过250个，多的从后面删除
  if (title.length > MAX_TITLE_LENGTH) {
    title = truncateTitle(title, MAX_TITLE_LENGTH);
  }

  return title;
}

/**
 * 剔除英文标题中的「Comfort Colors」、「Cotton」与「®」，并限制最大 250 字符
 */
export function cleanEnglishTitle(rawEnglish: string): string {
  if (!rawEnglish) return '';
  let eng = String(rawEnglish);

  // 1. 剔除注册商标符号 ® 及 (R)、（R）、™
  eng = eng.replace(/[®™\u00AE\u2122]/g, '');
  eng = eng.replace(/\([rR]\)|（[rR]）|\[[rR]\]|【[rR]】/g, '');

  // 2. 剔除 Comfort Colors 与各种变体 (含 Comfort, Comfortable, Solace Colors 及中文遗留)
  eng = eng.replace(/\bcomfort\s*-?\s*colou?rs?\b/gi, '');
  eng = eng.replace(/\bcomfortable\s*colou?rs?\b/gi, '');
  eng = eng.replace(/\bsolace\s*colou?rs?\b/gi, '');
  eng = eng.replace(/\bconsolation\s*colou?rs?\b/gi, '');
  eng = eng.replace(/comfortcolou?rs?/gi, '');
  eng = eng.replace(/舒\s*适\s*色\s*彩/gi, '');
  eng = eng.replace(/舒\s*适\s*颜\s*色/gi, '');
  eng = eng.replace(/舒\s*适\s*色/gi, '');
  eng = eng.replace(/安\s*慰\s*色\s*彩/gi, '');
  eng = eng.replace(/安\s*慰\s*颜\s*色/gi, '');
  eng = eng.replace(/安\s*慰\s*色/gi, '');

  // 3. 剔除 Cotton (含 100% Cotton, Ringspun Cotton, Cotton Blend 等)
  eng = eng.replace(/\b100%\s*(ringspun\s*|combed\s*|organic\s*|pure\s*|all\s*|heavyweight\s*)?cottons?\b/gi, '');
  eng = eng.replace(/\b(ringspun|combed|organic|pure|heavyweight)\s+cottons?\b/gi, '');
  eng = eng.replace(/\bcotton\s*blend\b/gi, '');
  eng = eng.replace(/\bcotton\s*poly\b/gi, '');
  eng = eng.replace(/\bcotton\s*\/\s*poly\b/gi, '');
  eng = eng.replace(/\bcotton\s*fabric\b/gi, '');
  eng = eng.replace(/\bcotton\s*material\b/gi, '');
  eng = eng.replace(/\bcottons?\b/gi, '');
  eng = eng.replace(/100%\s*(纯棉|全棉|棉质|有机棉|棉)/gi, '');
  eng = eng.replace(/纯棉|全棉|棉质|有机棉|涤棉|精梳棉|水洗棉|针织棉|重磅棉|丝光棉|长绒棉/gi, '');
  eng = eng.replace(/棉/g, '');

  // 4. 清理空括号与多余标点
  eng = eng.replace(/\(\s*\)|\[\s*\]|【\s*】|（\s*）/g, '');
  eng = eng
    .replace(/[,，]{2,}/g, ', ')
    .replace(/[-—]{2,}/g, '-')
    .replace(/\s+,\s*/g, ', ')
    .replace(/\s+-\s*-\s*/g, ' - ')
    .replace(/\s*[|/]\s*[|/]+/g, ' / ')
    .replace(/\s*,\s*-\s*/g, ', ')
    .replace(/\s*-\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,，\-—_/|]+|[\s,，\-—_/|]+$/g, '')
    .trim();

  // 5. 字符数不能超过250个，多的从后面删除
  if (eng.length > MAX_TITLE_LENGTH) {
    eng = truncateTitle(eng, MAX_TITLE_LENGTH);
  }

  return eng;
}

/**
 * 同时清理中英文标题对并限制长度不超过 250 字符
 */
export function cleanProductTitlePair(
  chineseTitle: string,
  englishTitle?: string
): { title: string; englishTitle: string } {
  const cleanTitle = cleanChineseTitle(chineseTitle);
  const cleanEng = englishTitle ? cleanEnglishTitle(englishTitle) : cleanEnglishTitle(cleanTitle);
  return {
    title: cleanTitle || truncateTitle(chineseTitle, MAX_TITLE_LENGTH),
    englishTitle: cleanEng || cleanTitle || truncateTitle(chineseTitle, MAX_TITLE_LENGTH),
  };
}

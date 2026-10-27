export const TEMPLATE_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const APPAREL_TEMPLATE_CATEGORIES = [
  { id: 'men-tee', label: '男士短袖' },
  { id: 'womens-plus-tee', label: '女士短袖 · 大码' },
  { id: 'womens-standard-tee', label: '女士短袖 · 标码' },
  { id: 'womens-sport-tee', label: '女士运动短袖' },
] as const;

export type ApparelTemplateCategory = (typeof APPAREL_TEMPLATE_CATEGORIES)[number]['id'];
export type WomenProductCategory = Exclude<ApparelTemplateCategory, 'men-tee'>;
export const WOMEN_TEMPLATE_CATEGORIES = APPAREL_TEMPLATE_CATEGORIES.filter((category) => category.id !== 'men-tee') as ReadonlyArray<{
  id: WomenProductCategory;
  label: string;
}>;

export interface CategoryTemplateInfo {
  exists: boolean;
  name?: string;
  savedAt?: string;
  size?: number;
}

const categoryUrl = (category: ApparelTemplateCategory, endpoint = '/api/category-template') =>
  endpoint + '?category=' + encodeURIComponent(category);

const TEMPLATE_CACHE_DB = 'apparel-category-template-cache';
const TEMPLATE_CACHE_STORE = 'templates';
interface CachedCategoryTemplate {
  file: Blob;
  name: string;
  savedAt?: string;
  size: number;
}

function openTemplateCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TEMPLATE_CACHE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(TEMPLATE_CACHE_STORE)) request.result.createObjectStore(TEMPLATE_CACHE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('打开模板缓存失败'));
  });
}

async function readCachedTemplate(category: ApparelTemplateCategory): Promise<CachedCategoryTemplate | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openTemplateCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_CACHE_STORE, 'readonly');
    const request = tx.objectStore(TEMPLATE_CACHE_STORE).get(category);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('读取模板缓存失败'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error || new Error('读取模板缓存失败')); };
  });
}

async function writeCachedTemplate(category: ApparelTemplateCategory, record: CachedCategoryTemplate): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openTemplateCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_CACHE_STORE, 'readwrite');
    tx.objectStore(TEMPLATE_CACHE_STORE).put(record, category);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('保存模板缓存失败')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('保存模板缓存失败')); };
  });
}

async function deleteCachedTemplate(category: ApparelTemplateCategory): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openTemplateCache();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_CACHE_STORE, 'readwrite');
    tx.objectStore(TEMPLATE_CACHE_STORE).delete(category);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('删除模板缓存失败')); };
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('读取模板文件失败'));
    reader.readAsDataURL(file);
  });
}

async function getError(response: Response, fallback: string): Promise<string> {
  const result = await response.json().catch(() => ({}));
  return result.error || fallback;
}

export async function saveCategoryTemplateFile(file: File, category: ApparelTemplateCategory): Promise<void> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('只支持 .xlsx 格式的上架模板');
  const response = await fetch(categoryUrl(category), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64: await readFileAsBase64(file), filename: file.name }),
  });
  if (!response.ok) throw new Error(await getError(response, '模板未能保存到腾讯云'));
  const saved = await response.json() as CategoryTemplateInfo;
  await writeCachedTemplate(category, { file: file.slice(0, file.size, TEMPLATE_TYPE), name: file.name, size: file.size, savedAt: saved.savedAt }).catch(() => {});
}

export async function loadCategoryTemplateFile(
  category: ApparelTemplateCategory,
  onInfo?: (info: CategoryTemplateInfo) => void,
  onProgress?: (loaded: number, total: number | null) => void
): Promise<{ file: File; info: CategoryTemplateInfo } | null> {
  let infoResponse: Response;
  try {
    infoResponse = await fetch(categoryUrl(category), { cache: 'no-store' });
  } catch (error) {
    const cached = await readCachedTemplate(category).catch(() => null);
    if (cached) {
      const info: CategoryTemplateInfo = { exists: true, name: cached.name, savedAt: cached.savedAt, size: cached.size };
      onInfo?.(info);
      onProgress?.(cached.size, cached.size);
      return { file: new File([cached.file], cached.name, { type: TEMPLATE_TYPE }), info };
    }
    throw error;
  }
  if (!infoResponse.ok) throw new Error(await getError(infoResponse, '读取腾讯云模板状态失败'));
  const info = await infoResponse.json() as CategoryTemplateInfo;
  if (!info.exists) return null;
  onInfo?.(info);

  try {
    const cached = await readCachedTemplate(category);
    if (cached && cached.name === info.name && cached.size === info.size && cached.savedAt === info.savedAt) {
      const file = new File([cached.file], cached.name, { type: TEMPLATE_TYPE });
      onProgress?.(cached.size, cached.size);
      return { file, info };
    }
  } catch {
    // A browser cache failure should fall through to the permanent COS copy.
  }

  const fileResponse = await fetch(categoryUrl(category, '/api/category-template/file'), { cache: 'no-store' });
  if (!fileResponse.ok) throw new Error(await getError(fileResponse, '读取腾讯云模板文件失败'));
  const totalHeader = Number(fileResponse.headers.get('Content-Length')) || info.size || 0;
  if (!fileResponse.body) {
    const blob = await fileResponse.blob();
    onProgress?.(blob.size, totalHeader || blob.size);
    const file = new File([blob], info.name || category + '-template.xlsx', { type: TEMPLATE_TYPE });
    void writeCachedTemplate(category, { file: blob, name: file.name, savedAt: info.savedAt, size: blob.size }).catch(() => {});
    return { file, info };
  }

  const reader = fileResponse.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let loaded = 0;
  onProgress?.(0, totalHeader || null);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Uint8Array.from(value).buffer);
    loaded += value.byteLength;
    onProgress?.(loaded, totalHeader || null);
  }
  const blob = new Blob(chunks, { type: TEMPLATE_TYPE });
  const file = new File([blob], info.name || category + '-template.xlsx', { type: TEMPLATE_TYPE });
  void writeCachedTemplate(category, { file: blob, name: file.name, savedAt: info.savedAt, size: blob.size }).catch(() => {});
  return { file, info };
}

export async function deleteCategoryTemplateFile(category: ApparelTemplateCategory): Promise<void> {
  const response = await fetch(categoryUrl(category), { method: 'DELETE' });
  if (!response.ok) throw new Error(await getError(response, '删除腾讯云模板失败'));
  await deleteCachedTemplate(category).catch(() => {});
}

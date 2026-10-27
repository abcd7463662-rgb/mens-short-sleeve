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
}

export async function loadCategoryTemplateFile(
  category: ApparelTemplateCategory,
  onInfo?: (info: CategoryTemplateInfo) => void,
  onProgress?: (loaded: number, total: number | null) => void
): Promise<{ file: File; info: CategoryTemplateInfo } | null> {
  const infoResponse = await fetch(categoryUrl(category), { cache: 'no-store' });
  if (!infoResponse.ok) throw new Error(await getError(infoResponse, '读取腾讯云模板状态失败'));
  const info = await infoResponse.json() as CategoryTemplateInfo;
  if (!info.exists) return null;
  onInfo?.(info);

  const fileResponse = await fetch(categoryUrl(category, '/api/category-template/file'), { cache: 'no-store' });
  if (!fileResponse.ok) throw new Error(await getError(fileResponse, '读取腾讯云模板文件失败'));
  const totalHeader = Number(fileResponse.headers.get('Content-Length')) || info.size || 0;
  if (!fileResponse.body) {
    const blob = await fileResponse.blob();
    onProgress?.(blob.size, totalHeader || blob.size);
    return { file: new File([blob], info.name || category + '-template.xlsx', { type: TEMPLATE_TYPE }), info };
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
  return { file: new File([blob], info.name || category + '-template.xlsx', { type: TEMPLATE_TYPE }), info };
}

export async function deleteCategoryTemplateFile(category: ApparelTemplateCategory): Promise<void> {
  const response = await fetch(categoryUrl(category), { method: 'DELETE' });
  if (!response.ok) throw new Error(await getError(response, '删除腾讯云模板失败'));
}

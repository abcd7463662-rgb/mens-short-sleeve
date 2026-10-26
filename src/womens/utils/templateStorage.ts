const TEMPLATE_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const WOMEN_PRODUCT_CATEGORIES = [
  { id: 'womens-plus-tee', label: '女士短袖 · 大码', configured: true },
  { id: 'womens-standard-tee', label: '女士短袖 · 标码', configured: false },
  { id: 'mens-hoodie', label: '男士卫衣', configured: false },
  { id: 'womens-hoodie', label: '女士卫衣', configured: false },
] as const;

export type WomenProductCategory = (typeof WOMEN_PRODUCT_CATEGORIES)[number]['id'];

const categoryUrl = (category: WomenProductCategory, endpoint = '/api/women/template') =>
  `${endpoint}?category=${encodeURIComponent(category)}`;

export async function saveTemplateFile(file: File, category: WomenProductCategory): Promise<void> {
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await fetch(categoryUrl(category), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: data, filename: file.name }),
    });
  } catch (error) {
    console.warn('保存女士模板失败:', error);
  }
}

export async function loadTemplateFile(category: WomenProductCategory): Promise<File | null> {
  try {
    const infoResponse = await fetch(categoryUrl(category), { cache: 'no-store' });
    if (!infoResponse.ok) return null;
    const info = await infoResponse.json();
    if (!info.exists) return null;
    const response = await fetch(categoryUrl(category, '/api/women/template/file'), { cache: 'no-store' });
    if (!response.ok) return null;
    return new File([await response.blob()], info.name || 'women-template.xlsx', { type: TEMPLATE_TYPE });
  } catch {
    return null;
  }
}

export async function deleteTemplateFile(category: WomenProductCategory): Promise<void> {
  try {
    await fetch(categoryUrl(category), { method: 'DELETE' });
  } catch (error) {
    console.warn('删除女士模板失败:', error);
  }
}

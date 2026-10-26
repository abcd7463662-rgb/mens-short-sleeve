const TEMPLATE_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
import type { SavedTemplateConfig } from '../features/templateGenerator/engine';

export interface SavedTemplateProfile {
  id: string;
  name: string;
  filename: string;
  config: SavedTemplateConfig;
  savedAt: string;
  size?: number;
  category?: WomenProductCategory;
}

export async function listTemplateProfiles(category: WomenProductCategory): Promise<SavedTemplateProfile[]> {
  const response = await fetch(`/api/women/templates?category=${encodeURIComponent(category)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('读取已保存模板失败');
  return response.json();
}

export async function saveTemplateProfile(file: File, profile: SavedTemplateProfile): Promise<void> {
  const fileBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const cosResponse = await fetch('/api/women/templates/cos-backup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: profile.id, category: profile.category, fileBase64, profile }),
  });
  const cosResult = await cosResponse.json().catch(() => ({}));
  if (!cosResponse.ok) throw new Error(cosResult.error || '腾讯云永久备份失败');
  const response = await fetch('/api/women/templates', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...profile, category: profile.category, fileBase64 }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '腾讯云已保存，但更新运行缓存失败');
}

export async function loadTemplateProfileFile(profile: SavedTemplateProfile): Promise<File> {
  const response = await fetch(`/api/women/templates/${encodeURIComponent(profile.id)}/file?category=${encodeURIComponent(profile.category || 'womens-plus-tee')}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('读取已保存模板文件失败');
  return new File([await response.blob()], profile.filename || 'template.xlsx', { type: TEMPLATE_TYPE });
}

export async function deleteTemplateProfile(id: string, category: WomenProductCategory): Promise<void> {
  const response = await fetch(`/api/women/templates/${encodeURIComponent(id)}?category=${encodeURIComponent(category)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('删除已保存模板失败');
}

export const WOMEN_PRODUCT_CATEGORIES = [
  { id: 'womens-plus-tee', label: '女士短袖 · 大码', configured: true },
  { id: 'womens-standard-tee', label: '女士短袖 · 标码', configured: false },
  { id: 'womens-sport-tee', label: '女士运动短袖', configured: false },
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

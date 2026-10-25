const TEMPLATE_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function saveTemplateFile(file: File): Promise<void> {
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await fetch('/api/women/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: data, filename: file.name }),
    });
  } catch (error) {
    console.warn('保存女士模板失败:', error);
  }
}

export async function loadTemplateFile(): Promise<File | null> {
  try {
    const infoResponse = await fetch('/api/women/template', { cache: 'no-store' });
    if (!infoResponse.ok) return null;
    const info = await infoResponse.json();
    if (!info.exists) return null;
    const response = await fetch('/api/women/template/file', { cache: 'no-store' });
    if (!response.ok) return null;
    return new File([await response.blob()], info.name || 'women-template.xlsx', { type: TEMPLATE_TYPE });
  } catch {
    return null;
  }
}

export async function deleteTemplateFile(): Promise<void> {
  try {
    await fetch('/api/women/template', { method: 'DELETE' });
  } catch (error) {
    console.warn('删除女士模板失败:', error);
  }
}

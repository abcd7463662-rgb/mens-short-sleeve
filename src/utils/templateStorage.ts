/**
 * 上架目标模板的持久化。
 *
 * 主存储是服务器上的 template_storage/（随仓库一起部署，重启不丢），
 * IndexedDB 只是本地副本：服务器不可达时仍能接着用上次的底表。
 */

const DB_NAME = 'mens-short-sleeve';
const DB_VERSION = 1;
const STORE_NAME = 'template';
const TEMPLATE_KEY = 'active';

export interface StoredTemplate {
  blob: Blob;
  name: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持 IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('打开本地数据库失败'));
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = action(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('本地存储操作失败'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('本地存储事务失败'));
        };
      })
  );
}

export async function saveTemplateFile(file: File): Promise<void> {
  const record: StoredTemplate = {
    blob: file.slice(0, file.size, file.type),
    name: file.name,
    savedAt: Date.now(),
  };
  await runTransaction('readwrite', (store) => store.put(record, TEMPLATE_KEY));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(blob);
  });
}

export interface ServerTemplateInfo {
  exists: boolean;
  name?: string;
  savedAt?: string;
  size?: number;
  backupToGitHub?: boolean;
}

export async function fetchServerTemplateInfo(): Promise<ServerTemplateInfo | null> {
  try {
    const res = await fetch('/api/template', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as ServerTemplateInfo;
  } catch {
    return null;
  }
}

/** 把模板上传到服务器保存，返回是否成功备份到 GitHub */
export async function uploadTemplateToServer(file: File): Promise<{ backedUp: boolean } | null> {
  try {
    const fileBase64 = await blobToBase64(file);
    const res = await fetch('/api/template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64, filename: file.name }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { backedUp: Boolean(data?.backedUp) };
  } catch {
    return null;
  }
}

/** 从服务器取回已保存的模板 */
export async function downloadTemplateFromServer(): Promise<File | null> {
  try {
    const info = await fetchServerTemplateInfo();
    if (!info?.exists) return null;

    const res = await fetch('/api/template/file', { cache: 'no-store' });
    if (!res.ok) return null;

    const blob = await res.blob();
    return new File([blob], info.name || 'template.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  } catch {
    return null;
  }
}

export async function deleteServerTemplate(): Promise<void> {
  try {
    await fetch('/api/template', { method: 'DELETE' });
  } catch {
    // 忽略：本地副本随后也会被清掉
  }
}

export async function loadTemplateFile(): Promise<{ file: File; savedAt: number } | null> {
  try {
    const record = await runTransaction<StoredTemplate | undefined>('readonly', (store) =>
      store.get(TEMPLATE_KEY) as IDBRequest<StoredTemplate | undefined>
    );
    if (!record?.blob) return null;

    const file = new File([record.blob], record.name, {
      type: record.blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    return { file, savedAt: record.savedAt };
  } catch (err) {
    console.warn('读取已保存模板失败:', err);
    return null;
  }
}

export async function clearTemplateFile(): Promise<void> {
  try {
    await runTransaction('readwrite', (store) => store.delete(TEMPLATE_KEY) as IDBRequest<undefined>);
  } catch (err) {
    console.warn('清除已保存模板失败:', err);
  }
}

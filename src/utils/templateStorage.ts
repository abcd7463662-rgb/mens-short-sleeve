/**
 * 上架目标模板的本地持久化。
 *
 * 用户每次工作都要上传同一份底表，这里把它存进 IndexedDB（不是 localStorage，
 * 因为底表通常几 MB，超过 localStorage 的配额），下次打开页面自动恢复。
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

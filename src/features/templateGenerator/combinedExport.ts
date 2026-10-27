export interface CombinedExportOptions {
  template: File;
  products: unknown[];
  gender: 'men' | 'women';
  category?: string;
  outputName: string;
  onProgress?: (phase: string) => void;
}

export interface CombinedExportResult {
  buffer: ArrayBuffer;
  fileName: string;
}

export function exportCombinedTemplateInWorker({ template, products, gender, category, outputName, onProgress }: CombinedExportOptions): Promise<CombinedExportResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./combinedExport.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback();
    };

    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'progress') onProgress?.(message.phase);
      if (message.type === 'complete') {
        finish(() => resolve({ buffer: message.buffer, fileName: message.fileName }));
      }
      if (message.type === 'error') finish(() => reject(new Error(message.message)));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(() => reject(new Error('后台生成 Excel 失败，请重试。')));
    };

    template.arrayBuffer().then((buffer) => {
      worker.postMessage({ template: buffer, templateName: template.name, outputName, products, gender, category }, [buffer]);
    }).catch((error) => finish(() => reject(error)));
  });
}

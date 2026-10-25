import { ImageModifyParams, TaskSubmitResult, TaskPollResult, ApiResponse } from './types';

/**
 * 将本地图片文件转换为 Base64 Data URI
 */
export async function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('读取文件失败'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Recursively search and extract GENERATED image URL or Base64 data from API response.
 * CRITICAL: Must NEVER extract from 'params' or 'input', which contains the original reference image.
 */
export function extractOutputImageUrl(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  // 1. Explicit result_urls / thumbnail_urls from MaiziTech task response
  if (Array.isArray(data.result_urls) && data.result_urls.length > 0) {
    for (const url of data.result_urls) {
      if (typeof url === 'string' && url.trim().length > 0) {
        return url.trim();
      }
    }
  }

  if (Array.isArray(data.thumbnail_urls) && data.thumbnail_urls.length > 0) {
    for (const url of data.thumbnail_urls) {
      if (typeof url === 'string' && url.trim().length > 0) {
        return url.trim();
      }
    }
  }

  if (typeof data.result_url === 'string' && data.result_url.trim()) {
    return data.result_url.trim();
  }

  // 2. OpenAI-compatible format: data: [{ url: '...', b64_json: '...' }]
  if (Array.isArray(data.data) && data.data.length > 0) {
    for (const item of data.data) {
      if (typeof item?.url === 'string' && item.url.trim()) return item.url.trim();
      if (typeof item?.image_url === 'string' && item.image_url.trim()) return item.image_url.trim();
      if (typeof item?.b64_json === 'string' && item.b64_json.trim()) {
        return `data:image/png;base64,${item.b64_json.trim()}`;
      }
    }
  }

  // 3. Known output containers (excluding params/input)
  const outputContainers = [
    data.output,
    data.result,
    data.artifacts,
    data.generations,
    data.response,
  ];

  for (const container of outputContainers) {
    if (!container) continue;

    if (Array.isArray(container) && container.length > 0) {
      for (const item of container) {
        if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://') || item.startsWith('data:image/'))) {
          return item.trim();
        }
        if (item && typeof item === 'object') {
          const found = extractOutputImageUrl(item);
          if (found) return found;
        }
      }
    } else if (typeof container === 'object') {
      const found = extractOutputImageUrl(container);
      if (found) return found;
    } else if (typeof container === 'string' && (container.startsWith('http://') || container.startsWith('https://') || container.startsWith('data:image/'))) {
      return container.trim();
    }
  }

  // 4. Direct top-level output keys (excluding params/input/prompt/model)
  const directOutputKeys = ['url', 'image_url', 'imageUrl', 'download_url', 'file_url'];
  for (const key of directOutputKeys) {
    if (typeof data[key] === 'string') {
      const val = data[key].trim();
      if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('data:image/')) {
        return val;
      }
    }
  }

  return null;
}

/**
 * 1. 提交异步图片生成/编辑任务，立即获得 task_id
 */
export async function submitImageModifyTask(params: ImageModifyParams): Promise<TaskSubmitResult> {
  const response = await fetch('/api/image-modify/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const resJson: any = await response.json();

  if (!response.ok || !resJson.success) {
    throw new Error(resJson.error || '提交任务失败，请检查网络或参数');
  }

  const directImage = resJson.imageUrl || extractOutputImageUrl(resJson.raw) || extractOutputImageUrl(resJson);

  return {
    success: true,
    completed: Boolean(resJson.completed || directImage),
    taskId: resJson.taskId,
    status: resJson.status || 'pending',
    progress: typeof resJson.progress === 'number' ? resJson.progress : undefined,
    imageUrl: directImage,
    raw: resJson.raw,
  };
}

/**
 * 2. 轮询指定 task_id 的任务执行状态
 */
export async function pollTaskStatus(taskId: string): Promise<TaskPollResult> {
  const response = await fetch(`/api/image-modify/tasks/${encodeURIComponent(taskId)}`);
  const resJson: any = await response.json();

  if (!response.ok || !resJson.success) {
    throw new Error(resJson.error || '查询任务状态失败');
  }

  const resolvedImageUrl =
    resJson.imageUrl ||
    extractOutputImageUrl(resJson.raw) ||
    extractOutputImageUrl(resJson);

  return {
    success: true,
    taskId: resJson.taskId || taskId,
    status: resJson.status || (resolvedImageUrl ? 'completed' : 'pending'),
    progress: typeof resJson.progress === 'number' ? resJson.progress : undefined,
    imageUrl: resolvedImageUrl,
    error: resJson.error,
    raw: resJson.raw,
  };
}

/**
 * 3. 完整的异步生图流程控制器：提交任务 -> 定时轮询 -> 获取完成图片 URL
 */
export async function executeAsyncImageWorkflow(
  params: ImageModifyParams,
  onProgress: (info: { taskId: string; status: string; progress?: number; elapsedSeconds: number }) => void
): Promise<{ imageUrl: string; taskId: string }> {
  const startTime = Date.now();

  // 1. 提交任务
  const submitRes = await submitImageModifyTask(params);

  // 如果同步直接返回了图片（fallback 场景）
  if (submitRes.completed && submitRes.imageUrl) {
    return {
      imageUrl: submitRes.imageUrl,
      taskId: submitRes.taskId || 'direct-complete',
    };
  }

  const taskId = submitRes.taskId;
  if (!taskId) {
    throw new Error('未获取到有效的 task_id，无法追踪任务状态');
  }

  let currentStatus = submitRes.status || 'pending';
  let currentProgress = submitRes.progress;
  onProgress({
    taskId,
    status: currentStatus,
    progress: currentProgress,
    elapsedSeconds: 0,
  });

  // 2. 持续轮询，直到 completed / failed / violation，最长 180 秒
  const maxWaitMs = 180 * 1000;
  const pollIntervalMs = 1500;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    const pollRes = await pollTaskStatus(taskId);

    currentStatus = (pollRes.status || '').toLowerCase();
    currentProgress = pollRes.progress;

    // 提取有效图片 URL
    const finalImageUrl =
      pollRes.imageUrl ||
      extractOutputImageUrl(pollRes.raw) ||
      extractOutputImageUrl(pollRes);

    onProgress({
      taskId,
      status: finalImageUrl ? 'completed' : currentStatus,
      progress: currentProgress,
      elapsedSeconds,
    });

    if (finalImageUrl) {
      return {
        imageUrl: finalImageUrl,
        taskId,
      };
    }

    if (currentStatus === 'completed' || currentStatus === 'succeeded' || currentStatus === 'success') {
      console.error('[executeAsyncImageWorkflow] Task reported completed but no image URL found:', pollRes);
      const rawSnippet = pollRes.raw ? JSON.stringify(pollRes.raw).slice(0, 200) : 'none';
      throw new Error(`任务状态已完成，但未能在响应中提取到图片 URL。平台返回: ${rawSnippet}`);
    }

    if (currentStatus === 'failed' || currentStatus === 'violation' || currentStatus === 'error') {
      const reason = pollRes.error || (currentStatus === 'violation' ? '触发安全合规风控 (violation)' : '任务生成失败');
      throw new Error(`任务失败 [${currentStatus}]: ${reason}`);
    }
  }

  throw new Error(`任务等待超时 (已耗时 > 180s)，Task ID: ${taskId}，您可以稍后查询结果`);
}

/**
 * 历史/兼容包装
 */
export async function requestImageModification(params: ImageModifyParams): Promise<string> {
  const result = await executeAsyncImageWorkflow(params, () => {});
  return result.imageUrl;
}

/**
 * 生成对应的 cURL 调用模板代码（包含异步创建接口与轮询接口）
 */
export function buildCurlSnippet(params: ImageModifyParams, currentTaskId?: string): string {
  const sanitizedImages = params.images.map((img) =>
    img.startsWith('data:') ? '<Base64_Image_Data_URI>' : img
  );

  const payload = JSON.stringify(
    {
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size,
      resolution: params.resolution,
      images: sanitizedImages,
    },
    null,
    2
  );

  const taskIdPlaceholder = currentTaskId || 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  return `# 1. 提交异步图片生成/修改任务 (立即获得 task_id)
curl -X POST https://www.maizitech.ai/v1/images/generations \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '${payload}'

# 响应示例：
# {
#   "created": 1714012800,
#   "data": [{ "task_id": "${taskIdPlaceholder}", "status": "pending" }]
# }

# 2. 轮询任务状态 (直到 status 为 completed、failed 或 violation)
curl -X GET https://www.maizitech.ai/v1/tasks/${taskIdPlaceholder} \\
  -H "Authorization: Bearer sk-your-api-key"`;
}

/**
 * 专用的 ImgBB 4并发异步上传队列管理器
 * 支持 4 个独立并发队列通道 (Worker #1 ~ #4)
 */
export interface ImgbbQueueStatus {
  concurrency: number;
  running: number;
  pending: number;
  activeWorkerIds: number[];
}

export class ImgbbUploadQueueManager {
  private concurrency: number = 4;
  private running: number = 0;
  private queue: Array<{
    task: (workerId: number) => Promise<any>;
    resolve: (val: any) => void;
    reject: (err: any) => void;
  }> = [];
  private activeWorkers = new Set<number>();
  private listeners = new Set<(status: ImgbbQueueStatus) => void>();

  constructor(concurrency: number = 4) {
    this.concurrency = concurrency;
  }

  public setConcurrency(limit: number) {
    this.concurrency = Math.max(1, limit);
    this.processNext();
    this.notifyListeners();
  }

  public getConcurrency(): number {
    return this.concurrency;
  }

  public getStatus(): ImgbbQueueStatus {
    return {
      concurrency: this.concurrency,
      running: this.running,
      pending: this.queue.length,
      activeWorkerIds: Array.from(this.activeWorkers),
    };
  }

  public subscribe(listener: (status: ImgbbQueueStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const status = this.getStatus();
    this.listeners.forEach((l) => l(status));
  }

  private allocateWorkerId(): number {
    for (let i = 1; i <= this.concurrency; i++) {
      if (!this.activeWorkers.has(i)) {
        this.activeWorkers.add(i);
        return i;
      }
    }
    const fallbackId = this.running + 1;
    this.activeWorkers.add(fallbackId);
    return fallbackId;
  }

  private releaseWorkerId(workerId: number) {
    this.activeWorkers.delete(workerId);
  }

  public async enqueue<T>(task: (workerId: number) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        task,
        resolve,
        reject,
      });
      this.notifyListeners();
      this.processNext();
    });
  }

  private processNext() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.running++;
      const workerId = this.allocateWorkerId();
      this.notifyListeners();

      item
        .task(workerId)
        .then((res) => item.resolve(res))
        .catch((err) => item.reject(err))
        .finally(() => {
          this.releaseWorkerId(workerId);
          this.running--;
          this.notifyListeners();
          this.processNext();
        });
    }
  }
}

export const globalImgbbQueue = new ImgbbUploadQueueManager(4);

/**
 * 带有 4 并发队列调度和自动重试的 ImgBB 上传方法
 */
export async function uploadToImgbbQueued(
  imageUrl: string,
  apiKey?: string,
  expiration?: number,
  onStatusChange?: (info: { workerId: number; attempt: number; status: 'queued' | 'uploading' | 'retrying' | 'success' | 'error' }) => void,
  maxRetries = 3
): Promise<{ url: string; deleteUrl: string; raw: any; workerId: number }> {
  return globalImgbbQueue.enqueue(async (workerId) => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        if (onStatusChange) {
          onStatusChange({
            workerId,
            attempt,
            status: attempt === 0 ? 'uploading' : 'retrying',
          });
        }
        const result = await uploadToImgbb(imageUrl, apiKey, expiration);
        if (onStatusChange) {
          onStatusChange({ workerId, attempt, status: 'success' });
        }
        return {
          ...result,
          workerId,
        };
      } catch (err: any) {
        attempt++;
        if (attempt > maxRetries) {
          if (onStatusChange) {
            onStatusChange({ workerId, attempt: attempt - 1, status: 'error' });
          }
          throw new Error(`ImgBB 上传失败(已并发重试 ${maxRetries} 次): ${err.message || '网络连接或接口响应超时'}`);
        }
        // 阶梯等待重试
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
    throw new Error('ImgBB 上传失败');
  });
}

/**
 * 上传图片到 ImgBB
 */
export async function uploadToImgbb(imageUrl: string, apiKey?: string, expiration?: number): Promise<{ url: string; deleteUrl: string; raw: any }> {
  const response = await fetch('/api/upload-imgbb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl, key: apiKey, expiration }),
  });
  const resJson = await response.json();
  if (!response.ok || !resJson.success) {
    throw new Error(resJson.error || 'ImgBB 上传失败');
  }
  return {
    url: resJson.data.display_url || resJson.data.url,
    deleteUrl: resJson.data.delete_url,
    raw: resJson.data,
  };
}


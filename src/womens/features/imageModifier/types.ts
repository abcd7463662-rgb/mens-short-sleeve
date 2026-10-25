export interface ImageModifyParams {
  model: string;
  size: string;
  resolution: string;
  prompt: string;
  images: string[];
  n?: number;
  width?: number;
  height?: number;
  aspect_ratio?: string;
}

export interface TaskSubmitResult {
  success: boolean;
  completed: boolean;
  taskId?: string;
  status?: string;
  progress?: number;
  imageUrl?: string;
  error?: string;
  raw?: any;
}

export interface TaskPollResult {
  success: boolean;
  taskId: string;
  status: string; // 'pending' | 'processing' | 'running' | 'completed' | 'failed' | 'violation'
  progress?: number;
  imageUrl?: string | null;
  error?: string;
  raw?: any;
}

export interface ImageModifyHistoryItem {
  id: string;
  timestamp: number;
  taskId?: string;
  params: ImageModifyParams;
  referencePreview?: string;
  outputImageUrl: string;
  status: 'success' | 'failed';
  errorMessage?: string;
}

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  raw?: any;
}

export interface VariantTaskState {
  type: 'white' | 'black';
  label: string;
  prompt: string;
  status: 'pending' | 'running' | 'success' | 'error';
  outputUrl?: string;
  imgbbUrl?: string;
  taskId?: string;
  error?: string;
  retryCount: number; // 0 to 3
  maxRetries: number; // default 3
  elapsed: number;
  startTime?: number;
}

export interface ImageModifierQueueItem {
  id: string;
  source: 'local' | 'table';
  name: string; // 商品标题或文件名
  title?: string; // 商品标题 (写入模板 C6)
  englishTitle?: string; // 谷歌翻译英文标题 (写入模板 D6)
  imageUrl?: string; // 商品图片网络 URL
  dataUri?: string; // 本地 Base64
  file?: File;
  status?: 'pending' | 'running' | 'success' | 'error';
  elapsed?: number;
  isValidUrl?: boolean;
  rowIndex?: number;
  whiteVariant: VariantTaskState;
  blackVariant: VariantTaskState;
}


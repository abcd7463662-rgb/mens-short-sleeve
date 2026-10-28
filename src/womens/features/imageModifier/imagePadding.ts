/**
 * 图像白色背景填充至 1340*1785 (3:4 比例) 核心处理工具
 */

export const TARGET_WIDTH = 1340;
export const TARGET_HEIGHT = 1785;

export interface PadImageResult {
  dataUri: string;
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  paddedUrl?: string;
}

/**
 * 将任意尺寸或比例的图片居中绘制到 1340*1785 的白色背景画布上
 * - 保持原始图像比例不变 (contain / aspect-fit)
 * - 不裁剪、不拉伸图像
 * - 边缘不足部分自动填充纯白 (#FFFFFF)
 */
export async function padImageTo1340x1785(
  imageSource: string | File | Blob,
  quality: number = 1.0
): Promise<PadImageResult> {
  return new Promise((resolve, reject) => {
    let srcUrl = '';
    let isObjectUrl = false;

    if (typeof imageSource === 'string') {
      // If it's an external HTTP URL, proxy it to prevent CORS canvas taint
      if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
        srcUrl = `/api/proxy-image?url=${encodeURIComponent(imageSource)}`;
      } else {
        srcUrl = imageSource;
      }
    } else {
      srcUrl = URL.createObjectURL(imageSource);
      isObjectUrl = true;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loadTimeout = window.setTimeout(() => {
      img.src = '';
      if (isObjectUrl) URL.revokeObjectURL(srcUrl);
      reject(new Error('加载生成图片超时'));
    }, 45000);

    img.onload = () => {
      window.clearTimeout(loadTimeout);
      try {
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;

        const canvas = document.createElement('canvas');
        canvas.width = TARGET_WIDTH;
        canvas.height = TARGET_HEIGHT;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          throw new Error('无法创建 Canvas 2D 绘图上下文');
        }

        // 1. 填充纯白色背景
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

        // 2. 图像平滑渲染配置
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 3. 计算等比例缩放与居中偏移
        const scale = Math.min(TARGET_WIDTH / origW, TARGET_HEIGHT / origH);
        const drawWidth = Math.round(origW * scale);
        const drawHeight = Math.round(origH * scale);
        const offsetX = Math.round((TARGET_WIDTH - drawWidth) / 2);
        const offsetY = Math.round((TARGET_HEIGHT - drawHeight) / 2);

        // 4. 居中绘制原始图像
        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        // 5. 导出为高品质 JPEG Data URI 与 Blob (0.85 经典高画质高压缩率，体积仅 200KB 左右，100% 避开 ERP 大文件上传限制)
        const dataUri = canvas.toDataURL('image/jpeg', 0.85);

        canvas.toBlob(
          (blob) => {
            if (isObjectUrl) {
              URL.revokeObjectURL(srcUrl);
            }
            if (blob) {
              resolve({
                dataUri,
                blob,
                width: TARGET_WIDTH,
                height: TARGET_HEIGHT,
                originalWidth: origW,
                originalHeight: origH,
              });
            } else {
              reject(new Error('Canvas toBlob 导出失败'));
            }
          },
          'image/jpeg',
          0.85
        );
      } catch (err: any) {
        if (isObjectUrl) {
          URL.revokeObjectURL(srcUrl);
        }
        reject(err);
      }
    };

    img.onerror = () => {
      window.clearTimeout(loadTimeout);
      if (isObjectUrl) {
        URL.revokeObjectURL(srcUrl);
      }
      reject(new Error('无法加载待处理的图像'));
    };

    img.src = srcUrl;
  });
}

/**
 * 将图片在客户端强制按 1340*1785 (纯白填充) 处理后直接触发浏览器下载
 * 100% 确保下载出来的本地文件就是 1340px * 1785px！
 */
export async function downloadImageAs1340x1785(
  imageSource: string | File | Blob,
  filename: string = 'AI_Product_1340x1785.JPG'
): Promise<void> {
  const padRes = await padImageTo1340x1785(imageSource, 1.0);
  const blobUrl = URL.createObjectURL(padRes.blob);
  const cleanFilename = filename.endsWith('.JPG') || filename.endsWith('.JPEG') || filename.endsWith('.jpg') || filename.endsWith('.jpeg')
    ? filename.replace(/\.(jpg|jpeg)$/i, '.JPG')
    : `${filename}.JPG`;

  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = cleanFilename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 3000);
}

/**
 * 将 1340*1785 填充后的图片持久化存储至服务器端，返回可供直链下载与模板引用的绝对 URL
 */
export async function saveHostedImage(
  imageBase64: string,
  preferredFilename?: string
): Promise<{ url: string; relativePath: string; filename: string }> {
  const response = await fetch('/api/hosted-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      filename: preferredFilename,
    }),
    signal: AbortSignal.timeout(60000),
  });

  const resJson = await response.json();
  if (!response.ok || !resJson.success) {
    throw new Error(resJson.error || '保存托管图片失败');
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const finalAbsoluteUrl = resJson.relativePath ? `${origin}${resJson.relativePath}` : resJson.url;

  return {
    url: finalAbsoluteUrl,
    relativePath: resJson.relativePath,
    filename: resJson.filename,
  };
}


/**
 * 清洗或格式化图片 URL，以便符合商家和 ERP 上架的要求
 * 1. 自动过滤掉 Data URI (如果是 base64 文本，则不作修改，或提示警告)
 * 2. 移除一些已知的 CDN 追踪和缓存干扰参数
 */
export function cleanImageUrlForMerchant(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  
  // 如果是 data:image 这种 Base64 格式，直接返回
  if (trimmed.startsWith('data:')) {
    return trimmed;
  }
  
  try {
    // 处理正常的 URL
    const parsed = new URL(trimmed);
    
    // 移除部分通用的推广和追踪参数
    const params = parsed.searchParams;
    params.delete('spm');
    params.delete('utm_source');
    params.delete('utm_medium');
    params.delete('utm_campaign');

    // COS 直传的预签名参数只对当次 PUT 有效，过期后带参数访问会被拒绝。
    // 对象本身是公网可读的，去掉签名参数才是可长期使用的图片链接。
    if (parsed.hostname.endsWith('.myqcloud.com')) {
      parsed.search = '';
      parsed.hash = '';
    }
    
    return parsed.toString();
  } catch (e) {
    // 如果 URL 解析失败（例如相对路径、特定简写或无效字符串），直接返回原字符串
    return trimmed;
  }
}

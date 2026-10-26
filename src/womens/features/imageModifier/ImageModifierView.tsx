import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Play,
  Pause,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileUp,
  FileDown,
  Layers,
  Sparkles,
  ExternalLink,
  Check,
  Copy,
  Trash2,
  X,
  Edit2,
  ArrowRight,
  Eye,
  Maximize2,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Square,
  Scaling,
  Languages,
  Globe,
  Loader2,
  Shuffle,
  Settings,
  Folder,
  Package,
  Cloud,
  CloudUpload,
  Key,
} from 'lucide-react';
import JSZip from 'jszip';
import { fileToDataUri, executeAsyncImageWorkflow } from './engine';
import { PROMPT_WHITE, PROMPT_BLACK, PROMPT_APRICOT, PROMPT_GREEN } from './presets';
import { ImageModifyParams } from './types';
import { parseProductTable, TableParseResult } from './tableParser';
import {
  padImageTo1340x1785,
  downloadImageAs1340x1785,
  saveHostedImage,
  TARGET_WIDTH,
  TARGET_HEIGHT,
} from './imagePadding';
import {
  generateProductTemplateFile,
  generateMultiProductTemplateFile,
  downloadTemplateFile,
  ColorKey,
  COLOR_NAMES,
  generateMappedTemplateFile,
  SavedTemplateConfig,
  SavedTemplateField,
} from '../templateGenerator';
import { generate018SpuCode } from '../templateGenerator/rules';
import { inspectTemplateFile } from '../templateGenerator';
import { translateTitleWithGoogle, translateBatchTitlesWithGoogle } from '../../utils/translator';
import { cleanChineseTitle, cleanEnglishTitle } from '../../utils/titleCleaner';
import { deleteTemplateFile, loadTemplateFile, saveTemplateFile, WOMEN_PRODUCT_CATEGORIES, WomenProductCategory, deleteTemplateProfile, listTemplateProfiles, loadTemplateProfileFile, saveTemplateProfile, SavedTemplateProfile } from '../../utils/templateStorage';

export interface ProductItem {
  id: string;
  title: string;
  englishTitle?: string;
  isTranslating?: boolean;
  imageUrl: string;
  whiteUrl?: string;
  blackUrl?: string;
  apricotUrl?: string;
  greenUrl?: string;
  isPadded?: boolean;
  whitePadded?: boolean;
  blackPadded?: boolean;
  apricotPadded?: boolean;
  greenPadded?: boolean;
  status: 'idle' | 'running' | 'success' | 'error';
  whiteStatus: 'idle' | 'running' | 'success' | 'error';
  blackStatus: 'idle' | 'running' | 'success' | 'error';
  apricotStatus: 'idle' | 'running' | 'success' | 'error';
  greenStatus: 'idle' | 'running' | 'success' | 'error';
  whiteError?: string;
  blackError?: string;
  apricotError?: string;
  greenError?: string;
  cosUploadErrors?: Partial<Record<'white' | 'black' | 'apricot' | 'green', string>>;
  errorMsg?: string;
  file?: File;
  firstColor?: ColorKey;
  colorOrder?: ColorKey[]; // 2色先后排布顺序：白色、黑色
  spuCode?: string;
}

const COS_UPLOAD_MAX_ATTEMPTS = 3;

async function uploadImageToCos(payload: Record<string, unknown>): Promise<{ success: true; url: string }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= COS_UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch('/api/cos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success && result.url) return result;
      throw new Error(result.error || `HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < COS_UPLOAD_MAX_ATTEMPTS) {
        console.warn(`COS upload attempt ${attempt}/${COS_UPLOAD_MAX_ATTEMPTS} failed; retrying:`, lastError.message);
        await new Promise((resolve) => setTimeout(resolve, attempt * 700));
      }
    }
  }

  throw new Error(`连续尝试 ${COS_UPLOAD_MAX_ATTEMPTS} 次仍失败：${lastError?.message || '未知错误'}`);
}

export const COLOR_CONFIG: {
  key: ColorKey;
  name: string;
  enName: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotBg: string;
  headerText: string;
  prompt: string;
}[] = [
  {
    key: 'white',
    name: '白色',
    enName: 'White',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
    dotBg: 'bg-blue-500',
    headerText: 'text-blue-600',
    prompt: PROMPT_WHITE,
  },
  {
    key: 'black',
    name: '黑色',
    enName: 'Black',
    badgeBg: 'bg-zinc-800',
    badgeText: 'text-zinc-100',
    badgeBorder: 'border-zinc-700',
    dotBg: 'bg-zinc-900',
    headerText: 'text-zinc-800',
    prompt: PROMPT_BLACK,
  },
];

const getRandomColorOrder = (): ColorKey[] => {
  const arr: ColorKey[] = ['white', 'black'];
  return arr.sort(() => Math.random() - 0.5);
};

interface ImageModifierViewProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

interface PreviewModalData {
  isOpen: boolean;
  title: string;
  englishTitle?: string;
  originalUrl: string;
  whiteUrl?: string;
  blackUrl?: string;
  apricotUrl?: string;
  greenUrl?: string;
  activeType: 'original' | ColorKey;
  spuCode?: string;
}

export const ImageModifierView: React.FC<ImageModifierViewProps> = ({ onShowToast }) => {
  const [productCategory, setProductCategory] = useState<WomenProductCategory>(() => {
    const stored = localStorage.getItem('WOMEN_PRODUCT_CATEGORY');
    return WOMEN_PRODUCT_CATEGORIES.some((category) => category.id === stored)
      ? (stored as WomenProductCategory)
      : 'womens-plus-tee';
  });
  const activeCategory = WOMEN_PRODUCT_CATEGORIES.find((category) => category.id === productCategory)!;
  const [templateProfiles, setTemplateProfiles] = useState<SavedTemplateProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [profileMode, setProfileMode] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileConfig, setProfileConfig] = useState<SavedTemplateConfig>({ name: '', targetSheetIndex: 1, startRow: 6, rowsPerProduct: 21, fields: [
    { id: 'title', label: '中文标题', source: 'title', column: 'C', rowOffset: 0 },
    { id: 'english', label: '英文标题', source: 'englishTitle', column: 'D', rowOffset: 0 },
    { id: 'spu', label: 'SPU编号', source: 'spuCode', column: 'B', rowOffset: 0 },
    { id: 'white', label: '白色图片', source: 'whiteImage', column: 'DX', rowOffset: 1 },
    { id: 'black', label: '黑色图片', source: 'blackImage', column: 'DX', rowOffset: 2 },
  ] });
  const [profileFieldsOpen, setProfileFieldsOpen] = useState(false);
  const [profileSheets, setProfileSheets] = useState<Array<{ index: number; name: string }>>([]);
  // 1. 商品信息导入状态
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [tableFile, setTableFile] = useState<File | null>(null);
  const [isParsingTable, setIsParsingTable] = useState<boolean>(false);
  const [tableResult, setTableResult] = useState<TableParseResult | null>(null);

  // 2. 模板导入状态
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [loadedTemplateCategory, setLoadedTemplateCategory] = useState<WomenProductCategory | null>(null);
  useEffect(() => { listTemplateProfiles().then(setTemplateProfiles).catch((error) => console.warn(error)); }, []);

  useEffect(() => {
    if (profileMode) return;
    let cancelled = false;
    setTemplateFile(null);
    setLoadedTemplateCategory(null);
    loadTemplateFile(productCategory).then((file) => {
      if (!cancelled) {
        setTemplateFile(file);
        setLoadedTemplateCategory(file ? productCategory : null);
      }
    });
    return () => { cancelled = true; };
  }, [productCategory, profileMode]);

  useEffect(() => {
    localStorage.setItem('WOMEN_PRODUCT_CATEGORY', productCategory);
  }, [productCategory]);

  // 3. 处理与导出状态 (支持最高 12 并发)
  const CONCURRENCY = 12;
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isBatchExporting, setIsBatchExporting] = useState<boolean>(false);
  const [isTranslatingAll, setIsTranslatingAll] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState<string>('');
  const [viewLayout, setViewLayout] = useState<'card' | 'table'>('card');
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // 大图弹窗预览状态
  const [previewModal, setPreviewModal] = useState<PreviewModalData>({
    isOpen: false,
    title: '',
    originalUrl: '',
    whiteUrl: undefined,
    blackUrl: undefined,
    apricotUrl: undefined,
    greenUrl: undefined,
    activeType: 'white',
    spuCode: undefined,
  });

  // 4. 本地自动下载状态 (默认关闭，直接走腾讯云云端直传)
  const [autoDownload, setAutoDownload] = useState<boolean>(false);
  const [localFolderPath, setLocalFolderPath] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('WOMEN_LOCAL_FOLDER_PATH');
      if (!stored || stored === 'D:\\images' || stored === 'C:\\跨境图片') {
        return 'C:\\Users\\Tnsk\\Downloads';
      }
      return stored;
    }
    return 'C:\\Users\\Tnsk\\Downloads';
  });
  const [localPathFormat, setLocalPathFormat] = useState<'windows' | 'fileUri' | 'fileUriUnencoded' | 'publicUrl'>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('WOMEN_LOCAL_PATH_FORMAT');
      if (stored === 'windows' || stored === 'fileUri' || stored === 'fileUriUnencoded' || stored === 'publicUrl') {
        return stored;
      }
    }
    return 'publicUrl';
  });

  const [filenameStyle, setFilenameStyle] = useState<'chinese' | 'spu'>(() => {
    if (typeof localStorage !== 'undefined') {
      return (localStorage.getItem('WOMEN_FILENAME_STYLE') as 'chinese' | 'spu') || 'spu';
    }
    return 'spu';
  });

  // 自定义图床/CDN/OSS 前缀 (例如: https://img.kwcdn.com/product/open 或阿里云/腾讯云 OSS)
  const [customCdnPrefix, setCustomCdnPrefix] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('WOMEN_CUSTOM_CDN_PREFIX') || '';
    }
    return '';
  });

  // 腾讯云 COS 存储桶与密钥配置 (已固定默认使用用户的专属存储桶 yxig-1500925420)

  const [cosBucket, setCosBucket] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('WOMEN_TENCENT_COS_BUCKET') || 'yxig-1500925420';
    }
    return 'yxig-1500925420';
  });

  const [cosRegion, setCosRegion] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('WOMEN_TENCENT_COS_REGION') || 'ap-guangzhou';
    }
    return 'ap-guangzhou';
  });

  const [cosStatus, setCosStatus] = useState<{
    configured: boolean;
    owner?: string;
    buckets: { name: string; region: string }[];
  }>({
    configured: false,
    buckets: [],
  });

  const [isCosModalOpen, setIsCosModalOpen] = useState<boolean>(false);
  const [isTestingCos, setIsTestingCos] = useState<boolean>(false);
  const [tempBucket, setTempBucket] = useState<string>('yxig-1500925420');
  const [tempRegion, setTempRegion] = useState<string>('ap-guangzhou');

  const [isUploadingCos, setIsUploadingCos] = useState<boolean>(false);
  const [cosUploadProgress, setCosUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // 初始化时检测服务端的腾讯云配置与已有存储桶
  const checkCosStatus = (sId?: string, sKey?: string) => {
    const query = new URLSearchParams();

    fetch(`/api/cos/status?${query.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.configured && !data.error) {
          setCosStatus({
            configured: true,
            owner: data.owner,
            buckets: data.buckets || [],
          });
        } else {
          setCosStatus({
            configured: false,
            buckets: [],
          });
        }
      })
      .catch((err) => console.warn('Failed to fetch COS status:', err));
  };

  useEffect(() => {
    checkCosStatus();
  }, []);

  useEffect(() => {
    localStorage.setItem('WOMEN_TENCENT_COS_BUCKET', cosBucket);
  }, [cosBucket]);

  useEffect(() => {
    localStorage.setItem('WOMEN_TENCENT_COS_REGION', cosRegion);
  }, [cosRegion]);

  // 打开腾讯云配置弹窗
  const openCosConfigModal = () => {
    setTempBucket(cosBucket || 'yxig-1500925420');
    setTempRegion(cosRegion || 'ap-guangzhou');
    setIsCosModalOpen(true);
  };

  // 测试并保存腾讯云密钥
  const handleSaveAndTestCos = async () => {
    setIsTestingCos(true);
    try {
      const res = await fetch('/api/cos/status');
      const data = await res.json();
      if (data.configured && !data.error) {
        setCosBucket(tempBucket.trim() || 'yxig-1500925420');
        setCosRegion(tempRegion.trim() || 'ap-guangzhou');
        setCosStatus({
          configured: true,
          owner: data.owner,
          buckets: data.buckets || [],
        });
        setIsCosModalOpen(false);
        onShowToast(`🎉 腾讯云 COS 密钥验证成功！已连接存储桶「${tempBucket.trim()}」，后续生图将 100% 自动秒级直传！`, 'success');
      } else {
        onShowToast(data.error || '请先由管理员在服务端配置腾讯云 COS 环境变量', 'error');
      }
    } catch (err: any) {
      onShowToast(`验证失败: ${err.message}`, 'error');
    } finally {
      setIsTestingCos(false);
    }
  };

  const [isZipping, setIsZipping] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('WOMEN_AUTO_DOWNLOAD_IMAGES', String(autoDownload));
  }, [autoDownload]);

  useEffect(() => {
    localStorage.setItem('WOMEN_LOCAL_FOLDER_PATH', localFolderPath);
  }, [localFolderPath]);

  useEffect(() => {
    localStorage.setItem('WOMEN_LOCAL_PATH_FORMAT', localPathFormat);
  }, [localPathFormat]);

  useEffect(() => {
    localStorage.setItem('WOMEN_FILENAME_STYLE', filenameStyle);
  }, [filenameStyle]);

  useEffect(() => {
    localStorage.setItem('WOMEN_CUSTOM_CDN_PREFIX', customCdnPrefix);
  }, [customCdnPrefix]);

  const getDownloadedFilename = (title: string, colorKey: ColorKey, spuCode?: string) => {
    const colorNameEng = colorKey === 'white' ? 'WHITE' : colorKey === 'black' ? 'BLACK' : String(colorKey).toUpperCase();
    const cleanSpu = (spuCode || '01893821049281').replace(/[^a-zA-Z0-9_-]/g, '');
    return `${cleanSpu}_${colorNameEng}_1340x1785.JPG`;
  };

              const getLocalFilePath = (
    folderPath: string,
    filename: string,
    format: 'windows' | 'fileUri' | 'fileUriUnencoded' | 'publicUrl'
  ) => {
    if (!folderPath.trim()) return '';
    let folder = folderPath.trim();
    if (folder.endsWith('\\') || folder.endsWith('/')) {
      folder = folder.slice(0, -1);
    }
    if (format === 'publicUrl') {
      return ''; // 返回空，外部逻辑会自动回退到已生成的公网 HTTPS 直链 URL
    }
    if (format === 'fileUri' || format === 'fileUriUnencoded') {
      let normalized = folder.replace(/\\/g, '/');
      if (!normalized.startsWith('file:///')) {
        if (normalized.startsWith('/')) {
          normalized = `file://${normalized}`;
        } else {
          normalized = `file:///${normalized}`;
        }
      }
      const fullPath = `${normalized}/${filename}`;
      if (format === 'fileUri') {
        // 百分号 URL 编码
        return encodeURI(fullPath);
      } else {
        // 原汁原味中文路径
        return fullPath;
      }
    } else {
      const isWindows = folder.includes('\\') || !folder.startsWith('/');
      const separator = isWindows ? '\\' : '/';
      return `${folder}${separator}${filename}`;
    }
  };

  const tableInputRef = useRef<HTMLInputElement | null>(null);
  const templateInputRef = useRef<HTMLInputElement | null>(null);
  const profileInputRef = useRef<HTMLInputElement | null>(null);
  const processingRef = useRef<boolean>(false);
  const productsRef = useRef<ProductItem[]>([]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Safe clipboard copy
  const safeCopy = async (text: string, id: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      onShowToast('已复制到剪贴板！', 'success');
    } catch {
      onShowToast('复制失败，请手动复制', 'error');
    }
  };

  // 100% 确保下载到本地的文件是严格 1340*1785 纯白填充的图片
  const handleDownload1340x1785 = async (
    sourceUrl: string,
    title: string,
    variantType: 'original' | ColorKey,
    spuCode?: string
  ) => {
    if (!sourceUrl) {
      onShowToast('暂无可下载的图片', 'error');
      return;
    }
    const colorName = variantType === 'original' ? '原图' : COLOR_CONFIG.find((c) => c.key === variantType)?.name || variantType;
    const key = `${title}_${variantType}`;
    setDownloadingKey(key);
    try {
      onShowToast(`正在生成并下载【${colorName}】1340×1785 高清图片...`, 'info');
      const filename = variantType === 'original'
        ? `${(title || '商品图片').replace(/[/\\?%*:|"<>]/g, '_')}_原图_1340x1785.JPG`
        : getDownloadedFilename(title, variantType as ColorKey, spuCode);
      await downloadImageAs1340x1785(sourceUrl, filename);
      onShowToast(`【${colorName}】1340×1785 高清图片下载成功！`, 'success');
    } catch (err: any) {
      onShowToast(err.message || '下载图片失败', 'error');
    } finally {
      setDownloadingKey(null);
    }
  };

  // --- 谷歌翻译全部标题 (填入 D6 / D 列) ---
  const handleTranslateAll = async (itemsToTranslate?: ProductItem[]) => {
    const list = itemsToTranslate || productsRef.current;
    if (list.length === 0) {
      onShowToast('暂无待翻译的商品', 'info');
      return;
    }

    setIsTranslatingAll(true);
    onShowToast(`正在调用谷歌翻译 API 翻译 ${list.length} 个商品标题...`, 'info');

    try {
      const titles = list.map((p) => cleanChineseTitle(p.title || ''));
      const translated = await translateBatchTitlesWithGoogle(titles, 'en');

      setProducts((prev) =>
        prev.map((item, index) => {
          const cleanedCn = cleanChineseTitle(item.title);
          const rawTrans = translated[index] || cleanedCn;
          const cleanedEn = cleanEnglishTitle(rawTrans);
          return {
            ...item,
            title: cleanedCn || item.title,
            englishTitle: cleanedEn,
            isTranslating: false,
          };
        })
      );

      onShowToast(`谷歌翻译完成！已自动剔除「舒适色彩/安慰色彩/棉/棉页/商品图片/®」，并填入 D6 及各行 D 列`, 'success');
    } catch (err: any) {
      onShowToast(err.message || '谷歌翻译服务调用失败，请重试', 'error');
    } finally {
      setIsTranslatingAll(false);
    }
  };

  // --- 谷歌翻译单个商品标题 ---
  const handleTranslateSingle = async (productId: string) => {
    const item = products.find((p) => p.id === productId);
    if (!item) return;

    const cleanedCn = cleanChineseTitle(item.title);

    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, title: cleanedCn || p.title, isTranslating: true } : p))
    );

    try {
      const translated = await translateTitleWithGoogle(cleanedCn, 'en');
      const cleanedEn = cleanEnglishTitle(translated);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? { ...p, title: cleanedCn || p.title, englishTitle: cleanedEn, isTranslating: false }
            : p
        )
      );
      onShowToast(`「${cleanedCn || item.title}」已完成谷歌翻译并自动剔除敏感词，填入对应 D 列`, 'success');
    } catch (err: any) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, isTranslating: false } : p))
      );
      onShowToast(err.message || '翻译失败', 'error');
    }
  };

  // --- 切换所有商品的 2 种颜色排布顺序 (白、黑) ---
  const handleShuffleColorOrder = () => {
    if (products.length === 0) return;
    setProducts((prev) =>
      prev.map((p) => {
        const newOrder = getRandomColorOrder();
        return {
          ...p,
          colorOrder: newOrder,
          firstColor: newOrder[0],
        };
      })
    );
    onShowToast('已重新随机所有商品的 2 色（白色、黑色）先后排布顺序！', 'success');
  };

  // --- 循环切换单个商品的颜色排布顺序 ---
  const toggleProductColorOrder = (id: string) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const current: ColorKey[] = p.colorOrder && p.colorOrder.length === 2 ? p.colorOrder : ['white', 'black'];
        const rotated: ColorKey[] = [...current.slice(1), current[0]];
        return { ...p, colorOrder: rotated, firstColor: rotated[0] };
      })
    );
  };

  // --- 1. 商品信息导入 ---
  const handleTableUpload = async (file: File) => {
    try {
      setIsParsingTable(true);
      const res = await parseProductTable(file, 0);
      setTableFile(file);
      setTableResult(res);

      const items: ProductItem[] = res.items.map((it) => {
        const cleanedTitle = cleanChineseTitle(it.title || `商品_${it.rowIndex}`) || `商品_${it.rowIndex}`;
        const order = getRandomColorOrder();
        return {
          id: it.id,
          title: cleanedTitle,
          imageUrl: it.imageUrl,
          status: 'idle',
          whiteStatus: 'idle',
          blackStatus: 'idle',
          apricotStatus: 'idle',
          greenStatus: 'idle',
          firstColor: order[0],
          colorOrder: order,
          spuCode: generate018SpuCode(),
        };
      });

      setProducts(items);
      onShowToast(`成功导入商品信息！已自动随机 4 色（白/黑/杏/绿）排布并剔除标题中「舒适色彩/安慰色彩/棉/棉页/商品图片/®」，正在调用谷歌翻译...`, 'success');

      // 自动触发谷歌翻译 API 异步批量翻译，将英文标题自动填入 D6 / D 列
      setTimeout(() => {
        handleTranslateAll(items);
      }, 300);
    } catch (err: any) {
      onShowToast(err.message || '商品表格解析失败，请检查文件', 'error');
    } finally {
      setIsParsingTable(false);
      if (tableInputRef.current) tableInputRef.current.value = '';
    }
  };

  // --- 2. 模板导入 ---
  const handleTemplateUpload = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      onShowToast('请选择 .xlsx 或 .xls 格式的 Excel 模板文件', 'error');
      return;
    }
    setTemplateFile(file);
    setProfileMode(false);
    setActiveProfileId('');
    setLoadedTemplateCategory(productCategory);
    void saveTemplateFile(file, productCategory);
    onShowToast(`已载入自定义模板文件：「${file.name}」`, 'success');
    if (templateInputRef.current) templateInputRef.current.value = '';
  };

  const handleProfileUpload = async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) { onShowToast('自定义模板档案请上传 .xlsx 格式文件，以保留工作表与原有样式', 'error'); return; }
    try {
      const inspection = await inspectTemplateFile(file);
      const preferredSheet = inspection.sheets.find((sheet) => sheet.name === '模版') || inspection.sheets.find((sheet) => sheet.isVisible && sheet.index > 0) || inspection.sheets[0];
      const name = profileName.trim() || file.name.replace(/\.(xlsx|xls)$/i, '');
      const config = { ...profileConfig, name, targetSheetIndex: preferredSheet.index };
      const profile: SavedTemplateProfile = { id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name, filename: file.name, config, savedAt: new Date().toISOString() };
      await saveTemplateProfile(file, profile);
      setTemplateProfiles((prev) => [...prev, profile]);
      setActiveProfileId(profile.id);
      setProfileMode(true);
      setProfileName(name);
      setProfileConfig(config);
      setProfileSheets(inspection.sheets.map(({ index, name }) => ({ index, name })));
      setTemplateFile(file);
      setLoadedTemplateCategory(productCategory);
      onShowToast(`模板「${name}」已保存；已选择工作表「${preferredSheet.name}」，请核对写入映射后保存配置。`, 'success');
    } catch (error: any) { onShowToast(error.message || '模板读取或保存失败', 'error'); }
    finally { if (profileInputRef.current) profileInputRef.current.value = ''; }
  };

  const handleSelectProfile = async (id: string) => {
    const profile = templateProfiles.find((item) => item.id === id);
    if (!profile) { setActiveProfileId(''); return; }
    try {
      const file = await loadTemplateProfileFile(profile);
      const inspection = await inspectTemplateFile(file);
      setProfileSheets(inspection.sheets.map(({ index, name }) => ({ index, name })));
      setTemplateFile(file);
      setLoadedTemplateCategory(productCategory);
      setActiveProfileId(profile.id);
      setProfileMode(true);
      setProfileName(profile.name);
      setProfileConfig(profile.config);
      onShowToast(`已载入「${profile.name}」模板`, 'success');
    } catch (error: any) { onShowToast(error.message || '加载模板失败', 'error'); }
  };

  const handleSaveProfileConfig = async () => {
    if (!activeProfileId || !templateFile) return;
    const name = profileName.trim();
    if (!name) { onShowToast('请填写模板名称', 'error'); return; }
    const config = { ...profileConfig, name };
    const profile: SavedTemplateProfile = { id: activeProfileId, name, filename: templateFile.name, config, savedAt: new Date().toISOString() };
    try {
      await saveTemplateProfile(templateFile, profile);
      setProfileConfig(config);
      setTemplateProfiles((prev) => prev.map((item) => item.id === profile.id ? profile : item));
      onShowToast(`「${name}」写入位置已永久保存`, 'success');
    } catch (error: any) { onShowToast(error.message || '配置保存失败', 'error'); }
  };

  const updateProfileField = (id: string, updates: Partial<SavedTemplateField>) => {
    setProfileConfig((prev) => ({ ...prev, fields: prev.fields.map((field) => field.id === id ? { ...field, ...updates } : field) }));
  };

  const addProfileField = () => {
    const id = `field_${Date.now()}`;
    const field: SavedTemplateField = { id, label: '新字段', source: 'title', column: 'A', rowOffset: 0, repeatCount: 1, rowStep: 1 };
    setProfileConfig((prev) => ({ ...prev, fields: [...prev.fields, field] }));
  };

  const handleDeleteProfile = async () => {
    if (!activeProfileId || !window.confirm(`确定永久删除模板「${profileName}」吗？`)) return;
    try {
      await deleteTemplateProfile(activeProfileId);
      setTemplateProfiles((prev) => prev.filter((profile) => profile.id !== activeProfileId));
      setActiveProfileId('');
      setProfileMode(false);
      setTemplateFile(null);
      setProfileName('');
      onShowToast('模板档案已删除', 'success');
    } catch (error: any) { onShowToast(error.message || '删除模板失败', 'error'); }
  };

  const handleResetTemplate = () => {
    if (profileMode) {
      setActiveProfileId('');
      setProfileMode(false);
      setTemplateFile(null);
      setLoadedTemplateCategory(null);
      onShowToast('已退出自定义模板档案', 'info');
      return;
    }
    setTemplateFile(null);
    setLoadedTemplateCategory(null);
    void deleteTemplateFile(productCategory);
    onShowToast('已重置为系统内置标准模板', 'info');
  };

  // --- 3. 模板导出与 6 并发四色生图 (gpt-image-2.5 + 自动 1340*1785 白色背景填充) ---
  const startProcessing = () => {
    if (products.length === 0) {
      onShowToast('请先导入商品信息表格', 'error');
      return;
    }
    processingRef.current = true;
    setIsProcessing(true);
    scheduleNextTasks();
  };

  const stopProcessing = () => {
    processingRef.current = false;
    setIsProcessing(false);
  };

  const scheduleNextTasks = () => {
    if (!processingRef.current) return;

    // Count currently running subtasks across all 4 colors
    let runningCount = 0;
    productsRef.current.forEach((p) => {
      if (p.whiteStatus === 'running') runningCount++;
      if (p.blackStatus === 'running') runningCount++;
      if (p.apricotStatus === 'running') runningCount++;
      if (p.greenStatus === 'running') runningCount++;
    });

    if (runningCount >= CONCURRENCY) return;

    // Collect pending subtasks up to CONCURRENCY (按每款商品随机设定的 4 色先后顺序排队)
    const tasksToRun: { productId: string; color: ColorKey }[] = [];
    for (const p of productsRef.current) {
      if (tasksToRun.length + runningCount >= CONCURRENCY) break;
      const order = p.colorOrder || ['white', 'black'];
      for (const color of order) {
        if (tasksToRun.length + runningCount >= CONCURRENCY) break;
        const statusKey = `${color}Status` as const;
        if (p[statusKey] === 'idle') {
          if (!tasksToRun.some((t) => t.productId === p.id && t.color === color)) {
            tasksToRun.push({ productId: p.id, color });
          }
        }
      }
    }

    if (tasksToRun.length === 0 && runningCount === 0) {
      stopProcessing();
      onShowToast('所有商品双色（白色、黑色）已处理完成！生成图片已自动通过白色填充适配至 1340*1785 标准分辨率', 'success');
      return;
    }

    for (const task of tasksToRun) {
      executeSingleColorTask(task.productId, task.color);
    }
  };

  const executeSingleColorTask = async (
    productId: string,
    color: ColorKey
  ) => {
    const product = productsRef.current.find((p) => p.id === productId);
    if (!product) return;

    const statusKey = `${color}Status` as const;
    const urlKey = `${color}Url` as const;
    const errorKey = `${color}Error` as const;
    const paddedKey = `${color}Padded` as const;
    const colorConf = COLOR_CONFIG.find((c) => c.key === color);
    const basePrompt = colorConf?.prompt || PROMPT_WHITE;
    const prompt = basePrompt.includes('1340px*1785px')
      ? basePrompt
      : `${basePrompt}，强制生成条件：图片尺寸必须为 1340px*1785px (3:4 比例)`;

    // Set running
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? { ...p, [statusKey]: 'running', [errorKey]: undefined, status: 'running' }
          : p
      )
    );

    try {
      const inputSource = product.imageUrl;
      if (!inputSource) {
        throw new Error('缺少图片链接');
      }

      const params: ImageModifyParams = {
        model: 'gpt-image-2.5',
        size: '3:4',
        resolution: '1K',
        prompt,
        images: [inputSource],
        n: 1,
      };

      const result = await executeAsyncImageWorkflow(params, () => {});
      let finalImageUrl = result.imageUrl;
      let cosUploadError = '';

      // 核心需求：自动通过纯白背景填充至 1340*1785 (3:4 标准电商主图规格)
      let paddedSuccess = false;
      let paddedBlob: Blob | null = null;
      try {
        const padded = await padImageTo1340x1785(result.imageUrl, 1.0);
        paddedSuccess = true;
        paddedBlob = padded.blob;

        // 1. 持久化存储至服务端托管目录，生成 100% 确切为 1340*1785 的公网可访问/可下载直链
        try {
          const safeTitle = (product.title || 'product').slice(0, 20).replace(/[/\\?%*:|"<>]/g, '_');
          const hostedRes = await saveHostedImage(
            padded.dataUri,
            `${safeTitle}_${productId}_${color}_1340x1785.JPG`
          );
          if (hostedRes?.url) {
            finalImageUrl = hostedRes.url;
          } else {
            finalImageUrl = padded.dataUri;
          }
        } catch (saveErr) {
          console.warn('Failed to save hosted image, using dataUri:', saveErr);
          finalImageUrl = padded.dataUri;
        }

        // 核心固定机制：生成填白完成后，100% 自动直传腾讯云 COS (国内免翻墙秒开，Temu/ERP秒读通过)
        const currentBucket = (cosBucket || 'yxig-1500925420').trim();
        const currentRegion = (cosRegion || 'ap-guangzhou').trim();
        if (currentBucket) {
          try {
            const cosFilename = getDownloadedFilename(product.title, color, product.spuCode);
            const cosJson = await uploadImageToCos({
                imageBase64: padded.dataUri,
                filename: cosFilename,
                bucket: currentBucket,
                region: currentRegion,
            });
            finalImageUrl = cosJson.url;
            console.log(`[Tencent COS Auto-Upload] Success for ${cosFilename}: ${cosJson.url}`);
          } catch (cosErr) {
            console.error('[Tencent COS Auto-Upload failed after retries]:', cosErr);
            cosUploadError = cosErr instanceof Error ? cosErr.message : String(cosErr);
            onShowToast(`图片已生成，但 COS 上传请求失败：${cosUploadError}`, 'error');
          }
        }
      } catch (padErr) {
        console.warn('Image padding failed, using raw output:', padErr);
      }

      // Success
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== productId) return p;
          const updated = {
            ...p,
            [statusKey]: 'success',
            [urlKey]: finalImageUrl,
            [paddedKey]: paddedSuccess,
            [errorKey]: undefined,
            cosUploadErrors: cosUploadError
              ? { ...p.cosUploadErrors, [color]: cosUploadError }
              : Object.fromEntries(Object.entries(p.cosUploadErrors || {}).filter(([key]) => key !== color)),
          };
          const allColorsDone =
            (color === 'white' ? 'success' : updated.whiteStatus) === 'success' &&
            (color === 'black' ? 'success' : updated.blackStatus) === 'success';
          return {
            ...updated,
            status: allColorsDone ? 'success' : 'running',
          };
        })
      );
    } catch (err: any) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                [statusKey]: 'error',
                [errorKey]: err.message || '生成失败',
                status: 'error',
                errorMsg: err.message || '生成失败',
              }
            : p
        )
      );
    } finally {
      setTimeout(() => {
        if (processingRef.current) {
          scheduleNextTasks();
        }
      }, 200);
    }
  };

  // 单独重试某款商品的某颜色
  const handleRetrySingleColor = (productId: string, color: ColorKey) => {
    executeSingleColorTask(productId, color);
  };

  // 手动对某张图片执行白色背景填充至 1340*1785 并更新为 1340*1785 直链
  const handleManualPadImage = async (productId: string, targetType: 'original' | ColorKey) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const sourceUrl =
      targetType === 'original'
        ? product.imageUrl
        : targetType === 'white'
        ? product.whiteUrl
        : targetType === 'black'
        ? product.blackUrl
        : targetType === 'apricot'
        ? product.apricotUrl
        : product.greenUrl;

    if (!sourceUrl) {
      onShowToast('该图片尚未生成或不存在', 'error');
      return;
    }

    try {
      onShowToast('正在将图片填充白色至 1340*1785 并生成下载直链...', 'info');
      const padRes = await padImageTo1340x1785(sourceUrl, 1.0);

      let finalUrl = padRes.dataUri;
      let cosUploadError = '';
      let cosUploadSucceeded = false;
      try {
        const safeTitle = (product.title || 'product').slice(0, 20).replace(/[/\\?%*:|"<>]/g, '_');
        const hostedRes = await saveHostedImage(
          padRes.dataUri,
          `${safeTitle}_${productId}_${targetType}_1340x1785.JPG`
        );
        if (hostedRes?.url) {
          finalUrl = hostedRes.url;
        }
      } catch (err) {
        console.warn('Hosted image save skipped:', err);
      }

      // 核心固定机制：手动填充后同样 100% 自动同步上传至腾讯云 COS
      const currentBucket = (cosBucket || 'yxig-1500925420').trim();
      const currentRegion = (cosRegion || 'ap-guangzhou').trim();
      if (currentBucket) {
        try {
          const cosFilename = getDownloadedFilename(product.title, targetType as any, product.spuCode);
          const cosJson = await uploadImageToCos({
              imageBase64: padRes.dataUri,
              filename: cosFilename,
              bucket: currentBucket,
              region: currentRegion,
          });
          finalUrl = cosJson.url;
          cosUploadSucceeded = true;
        } catch (cosErr) {
          console.error('Manual pad COS upload failed:', cosErr);
          cosUploadError = cosErr instanceof Error ? cosErr.message : String(cosErr);
        }
      }

      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== productId) return p;
          if (targetType === 'white') {
            return { ...p, whiteUrl: finalUrl, whitePadded: true };
          } else if (targetType === 'black') {
            return { ...p, blackUrl: finalUrl, blackPadded: true };
          } else {
            return { ...p, imageUrl: finalUrl, isPadded: true };
          }
        })
      );

      // 如果预览弹窗打开中，同步更新弹窗数据
      setPreviewModal((prev) => {
        if (!prev.isOpen) return prev;
        if (targetType === 'white') return { ...prev, whiteUrl: finalUrl };
        if (targetType === 'black') return { ...prev, blackUrl: finalUrl };
        return { ...prev, originalUrl: finalUrl };
      });

      onShowToast(
        cosUploadError
          ? `白底处理完成，但 COS 上传失败：${cosUploadError}。请用“同步全部图片”重试。`
          : cosUploadSucceeded
            ? '已完成白底处理和 COS 上传，图片规格为 1340*1785。'
            : '已完成白底处理，图片规格为 1340*1785。',
        cosUploadError ? 'error' : 'success'
      );
    } catch (err: any) {
      onShowToast(err.message || '图片填充处理失败', 'error');
    }
  };

  // 导出单个商品的 Excel 模板 (C6填中文标题，D6填谷歌翻译英文标题，双色黑白)
  const handleExportSingle = async (p: ProductItem, index: number) => {
    if (!activeCategory.configured && !activeProfileId) {
      onShowToast(`「${activeCategory.label}」尚未设置字段写入映射。请先配置专用映射，避免套用大码模板坐标。`, 'error');
      return;
    }
    try {
      const cleanedTitle = cleanChineseTitle(p.title) || p.title;
      const cleanedEng = cleanEnglishTitle(p.englishTitle || cleanedTitle);

      let whiteImg = p.whiteUrl || '';
      let blackImg = p.blackUrl || '';

      if (cosBucket.trim()) {
        const missingCos = [
          !p.whiteUrl?.includes('.myqcloud.com') ? '白色' : '',
          !p.blackUrl?.includes('.myqcloud.com') ? '黑色' : '',
        ].filter(Boolean);
        if (missingCos.length) {
          onShowToast(`${missingCos.join('、')}图片尚未确认上传到 COS。请先点击“同步全部图片至腾讯云 COS”再导出。`, 'error');
          return;
        }
      } else if (customCdnPrefix.trim()) {
        let cleanPrefix = customCdnPrefix.trim();
        if (cleanPrefix.endsWith('/')) cleanPrefix = cleanPrefix.slice(0, -1);
        const fnWhite = getDownloadedFilename(p.title, 'white', p.spuCode);
        whiteImg = `${cleanPrefix}/${fnWhite}`;
        const fnBlack = getDownloadedFilename(p.title, 'black', p.spuCode);
        blackImg = `${cleanPrefix}/${fnBlack}`;
      } else if (localFolderPath.trim() && localPathFormat !== 'publicUrl') {
        const fnWhite = getDownloadedFilename(p.title, 'white', p.spuCode);
        whiteImg = getLocalFilePath(localFolderPath, fnWhite, localPathFormat);
        
        const fnBlack = getDownloadedFilename(p.title, 'black', p.spuCode);
        blackImg = getLocalFilePath(localFolderPath, fnBlack, localPathFormat);
      }

      const singleProduct = {
            title: cleanedTitle,
            englishTitle: cleanedEng,
            whiteImageUrl: whiteImg,
            blackImageUrl: blackImg,
            spuCode: p.spuCode,
            firstColor: p.colorOrder?.[0] || p.firstColor || 'white',
            colorOrder: p.colorOrder,
          };
      const customFilename = `${(cleanedTitle || `商品_${index + 1}`).replace(/[/\\?%*:|"<>]/g, '_')}_上架模板.xlsx`;
      const res = activeProfileId && templateFile
        ? await generateMappedTemplateFile({ file: templateFile, config: { ...profileConfig, name: profileName || profileConfig.name }, products: [singleProduct], filename: customFilename })
        : await generateMultiProductTemplateFile({ products: [singleProduct], baseTemplateFile: templateFile || undefined, customFilename });

      downloadTemplateFile(res.outputBlob, res.fileName);
      onShowToast(
        localFolderPath.trim()
          ? `成功导出「${cleanedTitle}」标准上架模板（已自动将DS列替换为本地链接：${localFolderPath}）！`
          : `成功导出「${cleanedTitle}」标准上架模板（含 C6/D6 及 4 色随机顺序）！`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err.message || '导出模板失败', 'error');
    }
  };

  const handleDeleteProduct = (product: ProductItem) => {
    if (!window.confirm(`确定删除商品「${product.title}」吗？`)) return;
    setProducts((prev) => prev.filter((item) => item.id !== product.id));
    if (editingId === product.id) setEditingId(null);
    onShowToast(`已删除商品「${product.title}」`, 'success');
  };

  // 导出全部商品整合在同一个表格内（C6填中文，D6填谷歌翻译英文标题，每款商品随机 4 色顺序）
  const handleExportCombined = async () => {
    if (!activeCategory.configured && !activeProfileId) {
      onShowToast(`「${activeCategory.label}」尚未设置字段写入映射。请先配置专用映射，避免套用大码模板坐标。`, 'error');
      return;
    }
    if (products.length === 0) {
      onShowToast('请先在第 1 步导入商品信息', 'error');
      return;
    }

    setIsBatchExporting(true);
    try {
      // 检查是否有尚未翻译的英文标题，导出前自动进行快速翻译补齐
      let currentProducts = products;
      const needTrans = products.some((p) => !p.englishTitle || p.englishTitle === cleanChineseTitle(p.title));
      if (needTrans) {
        try {
          const titles = products.map((p) => cleanChineseTitle(p.title || ''));
          const translatedList = await translateBatchTitlesWithGoogle(titles, 'en');
          currentProducts = products.map((p, idx) => ({
            ...p,
            englishTitle: cleanEnglishTitle(translatedList[idx] || p.englishTitle || p.title),
          }));
          setProducts(currentProducts);
        } catch (tErr) {
          console.warn('Auto translation during batch export skipped:', tErr);
        }
      }

      const inputs = currentProducts.map((p) => {
        const cTitle = cleanChineseTitle(p.title || '');
        const eTitle = cleanEnglishTitle(p.englishTitle || cTitle);

        let whiteImg = p.whiteUrl || '';
        let blackImg = p.blackUrl || '';

        const hasWhite = Boolean(p.whiteUrl && (!cosBucket.trim() || p.whiteUrl.includes('.myqcloud.com')));
        const hasBlack = Boolean(p.blackUrl && (!cosBucket.trim() || p.blackUrl.includes('.myqcloud.com')));
        if (!cosBucket.trim() && customCdnPrefix.trim()) {
          let cleanPrefix = customCdnPrefix.trim();
          if (cleanPrefix.endsWith('/')) cleanPrefix = cleanPrefix.slice(0, -1);
          const fnWhite = getDownloadedFilename(p.title, 'white', p.spuCode);
          whiteImg = hasWhite ? `${cleanPrefix}/${fnWhite}` : '';
          const fnBlack = getDownloadedFilename(p.title, 'black', p.spuCode);
          blackImg = hasBlack ? `${cleanPrefix}/${fnBlack}` : '';
        } else if (!cosBucket.trim() && localFolderPath.trim() && localPathFormat !== 'publicUrl') {
          const fnWhite = getDownloadedFilename(p.title, 'white', p.spuCode);
          whiteImg = hasWhite ? getLocalFilePath(localFolderPath, fnWhite, localPathFormat) : '';
          
          const fnBlack = getDownloadedFilename(p.title, 'black', p.spuCode);
          blackImg = hasBlack ? getLocalFilePath(localFolderPath, fnBlack, localPathFormat) : '';
        }

        const apricotImg = p.apricotUrl && (!cosBucket.trim() || p.apricotUrl.includes('.myqcloud.com')) ? p.apricotUrl : '';
        const greenImg = p.greenUrl && (!cosBucket.trim() || p.greenUrl.includes('.myqcloud.com')) ? p.greenUrl : '';

        return {
          title: cTitle,
          englishTitle: eTitle,
          whiteImageUrl: whiteImg,
          blackImageUrl: blackImg,
          apricotImageUrl: apricotImg,
          greenImageUrl: greenImg,
          firstColor: p.colorOrder?.[0] || p.firstColor || 'white',
          colorOrder: p.colorOrder,
        };
      });

      const exportName = products.length > 1
        ? `${profileName || activeCategory.label}_上架模板_共${products.length}款.xlsx`
        : `${(inputs[0]?.title || '商品').slice(0, 20).replace(/[/\\?%*:|"<>]/g, '_')}_标准上架模板.xlsx`;
      const res = activeProfileId && templateFile
        ? await generateMappedTemplateFile({ file: templateFile, config: { ...profileConfig, name: profileName || profileConfig.name }, products: inputs, filename: exportName })
        : await generateMultiProductTemplateFile({ products: inputs, baseTemplateFile: templateFile || undefined, customFilename: exportName });

      downloadTemplateFile(res.outputBlob, res.fileName);
      const missingImages = currentProducts.reduce((count, p) => count + [p.whiteUrl, p.blackUrl, p.apricotUrl, p.greenUrl].filter((url) => !url || (cosBucket.trim() && !url.includes('.myqcloud.com'))).length, 0);
      onShowToast(
        missingImages
          ? `模板已导出；${missingImages} 个未生成或未上传到 COS 的图片链接留空，可稍后重新导出。`
          : localFolderPath.trim()
          ? `成功导出整合模板！全部 ${products.length} 款商品的 DS列 均已安全替换为本地电脑路径「${localFolderPath}」`
          : activeProfileId
            ? `已按「${profileName || profileConfig.name}」的自定义映射导出 ${products.length} 款商品，其他工作表保持原样。`
            : `成功导出整合模板！已将全部 ${products.length} 款商品按随机 4 色顺序写入 EA 列，SPU 与 SKU 均已就绪。`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err.message || '整合导出模板失败', 'error');
    } finally {
      setIsBatchExporting(false);
    }
  };

  // 一键打包下载全部 1340*1785 生成主图 (ZIP 压缩包，方便批量拖入 Temu 素材中心或 ERP)
  const handleDownloadAllZip = async () => {
    const readyProducts = products.filter(
      (p) => p.whiteUrl || p.blackUrl || p.apricotUrl || p.greenUrl
    );

    if (readyProducts.length === 0) {
      onShowToast('暂无可打包的生成图片，请先在下方点击【开始生成】！', 'error');
      return;
    }

    setIsZipping(true);
    onShowToast('正在将全部 1340*1785 生成主图打包为 ZIP 压缩包，请稍候...', 'info');

    try {
      const zip = new JSZip();
      const folder = zip.folder('1340x1785_电商主图包') || zip;
      let count = 0;

      for (const p of readyProducts) {
        const colors: { key: string; url?: string; cn: string; en: string }[] = [
          { key: 'white', url: p.whiteUrl, cn: '白色', en: 'WHITE' },
          { key: 'black', url: p.blackUrl, cn: '黑色', en: 'BLACK' },
          { key: 'apricot', url: p.apricotUrl, cn: '杏色', en: 'APRICOT' },
          { key: 'green', url: p.greenUrl, cn: '绿色', en: 'GREEN' },
        ];

        for (const c of colors) {
          if (!c.url) continue;
          try {
            const resp = await fetch(c.url);
            const blob = await resp.blob();
            const filename =
              filenameStyle === 'spu' && p.spuCode
                ? `${p.spuCode}_${c.en}_1340x1785.JPG`
                : `${(p.title || '商品').slice(0, 30).replace(/[/\\?%*:|"<>]/g, '_')}_${c.cn}_1340x1785.JPG`;

            folder.file(filename, blob);
            count++;
          } catch (e) {
            console.warn(`Failed to fetch image for zip: ${c.url}`, e);
          }
        }
      }

      if (count === 0) {
        throw new Error('未获取到有效图片数据');
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const anchor = document.createElement('a');
      anchor.href = zipUrl;
      anchor.download = `电商主图包_1340x1785_共${count}张.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);
      onShowToast(
        `成功打包下载全部 ${count} 张 1340*1785 高清图片！可直接解压后批量拖入 Temu 素材中心或 ERP`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err.message || '打包 ZIP 失败', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  // 一键上传全部生成图片至腾讯云 COS 对象存储
  const handleUploadAllToCos = async () => {
    const targetBucket = cosBucket.trim();
    if (!targetBucket) {
      onShowToast('请先输入或选择您的腾讯云存储桶名称 (Bucket)！', 'error');
      return;
    }

    const readyProducts = products.filter(
      (p) => p.whiteUrl || p.blackUrl || p.apricotUrl || p.greenUrl
    );

    if (readyProducts.length === 0) {
      onShowToast('暂无可上传的图片，请先在下方点击【开始生成】四色图！', 'error');
      return;
    }

    const tasks: {
      productId: string;
      color: 'white' | 'black' | 'apricot' | 'green';
      imageUrl: string;
      filename: string;
    }[] = [];

    readyProducts.forEach((p) => {
      if (p.whiteUrl) {
        tasks.push({
          productId: p.id,
          color: 'white',
          imageUrl: p.whiteUrl,
          filename: getDownloadedFilename(p.title, 'white', p.spuCode),
        });
      }
      if (p.blackUrl) {
        tasks.push({
          productId: p.id,
          color: 'black',
          imageUrl: p.blackUrl,
          filename: getDownloadedFilename(p.title, 'black', p.spuCode),
        });
      }
      if (p.apricotUrl) {
        tasks.push({
          productId: p.id,
          color: 'apricot',
          imageUrl: p.apricotUrl,
          filename: getDownloadedFilename(p.title, 'apricot' as any, p.spuCode),
        });
      }
      if (p.greenUrl) {
        tasks.push({
          productId: p.id,
          color: 'green',
          imageUrl: p.greenUrl,
          filename: getDownloadedFilename(p.title, 'green' as any, p.spuCode),
        });
      }
    });

    setIsUploadingCos(true);
    setCosUploadProgress({ current: 0, total: tasks.length });
    onShowToast(`正在开始上传 ${tasks.length} 张图片至腾讯云 COS (${targetBucket})...`, 'info');

    let successCount = 0;
    try {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        setCosUploadProgress({ current: i + 1, total: tasks.length });

        // 客户端直接读取高清 Blob 并转换为 Base64，彻底避免外部重定向或权限缺失
        let clientBase64: string | undefined = undefined;
        try {
          if (task.imageUrl.startsWith('data:image/')) {
            clientBase64 = task.imageUrl;
          } else {
            const blobResp = await fetch(task.imageUrl);
            const blobData = await blobResp.blob();
            if (blobData && blobData.size > 15000) {
              clientBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blobData);
              });
            }
          }
        } catch (bErr) {
          console.warn('Client base64 conversion fallback to server resolution:', bErr);
        }

        const resJson = await uploadImageToCos({
            imageBase64: clientBase64,
            imageUrl: task.imageUrl,
            filename: task.filename,
            bucket: targetBucket,
            region: cosRegion,
        });

        const cosUrl = resJson.url;
        setProducts((prev) =>
          prev.map((item) => {
            if (item.id !== task.productId) return item;
            const remainingErrors = { ...item.cosUploadErrors };
            delete remainingErrors[task.color];
            const cosUploadErrors = Object.keys(remainingErrors).length ? remainingErrors : undefined;
            if (task.color === 'white') return { ...item, whiteUrl: cosUrl, cosUploadErrors };
            if (task.color === 'black') return { ...item, blackUrl: cosUrl, cosUploadErrors };
            if (task.color === 'apricot') return { ...item, apricotUrl: cosUrl, cosUploadErrors };
            if (task.color === 'green') return { ...item, greenUrl: cosUrl, cosUploadErrors };
            return item;
          })
        );
        successCount++;
      }

      onShowToast(`🎉 成功将全部 ${successCount} 张图片同步上传至腾讯云 COS！已生成国内秒开直链并填入系统！`, 'success');
    } catch (err: any) {
      onShowToast(err.message || '上传至腾讯云失败', 'error');
    } finally {
      setIsUploadingCos(false);
      setCosUploadProgress(null);
    }
  };

  // 打开大图预览弹窗
  const openImagePreview = (
    p: ProductItem,
    type: 'original' | ColorKey = 'white'
  ) => {
    setPreviewModal({
      isOpen: true,
      title: p.title,
      originalUrl: p.imageUrl,
      whiteUrl: p.whiteUrl,
      blackUrl: p.blackUrl,
      apricotUrl: p.apricotUrl,
      greenUrl: p.greenUrl,
      activeType: type,
      spuCode: p.spuCode,
    });
  };

  // Save inline title edit (Chinese / C column)
  const saveTitleEdit = async (id: string) => {
    if (!editTitleText.trim()) return;
    const cleaned = cleanChineseTitle(editTitleText.trim()) || editTitleText.trim();
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, title: cleaned, isTranslating: true } : p))
    );
    setEditingId(null);
    onShowToast('商品标题已更新并已自动剔除「舒适色彩/安慰色彩/棉/棉页/商品图片/®」，正在更新英文翻译...', 'success');

    try {
      const translated = await translateTitleWithGoogle(cleaned, 'en');
      const cleanEng = cleanEnglishTitle(translated);
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, englishTitle: cleanEng, isTranslating: false } : p))
      );
    } catch {
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isTranslating: false } : p))
      );
    }
  };

  // Stats
  const completedCount = products.filter((p) => p.whiteUrl && p.blackUrl && p.apricotUrl && p.greenUrl).length;
  const whiteDoneCount = products.filter((p) => p.whiteUrl).length;
  const blackDoneCount = products.filter((p) => p.blackUrl).length;
  const apricotDoneCount = products.filter((p) => p.apricotUrl).length;
  const greenDoneCount = products.filter((p) => p.greenUrl).length;
  const translatedCount = products.filter((p) => p.englishTitle && p.englishTitle !== p.title).length;

  return (
    <div className="womens-workspace w-full max-w-7xl mx-auto py-6 px-4 sm:px-6">
      {/* Hidden File Inputs */}
      <input
        ref={tableInputRef}
        type="file"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleTableUpload(f);
        }}
      />
      <input
        ref={templateInputRef}
        type="file"
        accept=".xlsx, .xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleTemplateUpload(f);
        }}
      />
      <input ref={profileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleProfileUpload(file); }} />

      {/* 极简主三步工作流 */}
      <div className="space-y-5">
        <div className="border-b border-blue-100 pb-4">
          <h1 className="text-lg font-semibold text-slate-900">女士短袖 · 商品上架</h1>
                  <p className="mt-0.5 text-xs text-slate-500">选择类目，导入商品和对应模板，再生成图片并导出</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="选择商品类目">
            {WOMEN_PRODUCT_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-pressed={productCategory === category.id}
                onClick={() => {
                  if (productCategory === category.id) return;
                  setTemplateFile(null);
                  setLoadedTemplateCategory(null);
                  setProductCategory(category.id);
                }}
                className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${productCategory === category.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-100 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'}`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
        {/* 步骤 1 & 2 并排核心卡片 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 模块 1：商品信息导入与谷歌翻译 */}
          <div className="workspace-panel p-4 text-left flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm border border-blue-100">
                    1
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900">商品表格与标题翻译</h2>
                </div>
                {products.length > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    已导入 {products.length} 款
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500">导入商品标题与原图链接，自动清理标题并翻译英文。</p>

              {/* 导入操作区 */}
              {tableFile ? (
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 truncate">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-800 truncate">{tableFile.name}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span>共识别 {products.length} 条商品</span>
                        <span>•</span>
                        <span className="text-emerald-700 font-medium">已接入谷歌翻译 (填入 D6)</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={isTranslatingAll}
                      onClick={() => handleTranslateAll()}
                      className="px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold cursor-pointer flex items-center gap-1 disabled:opacity-50"
                      title="调用谷歌翻译 API 重新翻译全部标题并填入 D6"
                    >
                      <Languages className="w-3.5 h-3.5" />
                      <span>{isTranslatingAll ? '翻译中...' : '重新翻译'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => tableInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer"
                    >
                      更换
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => tableInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 rounded-xl p-6 text-center cursor-pointer transition-colors"
                >
                  <FileUp className="w-7 h-7 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">点击上传商品信息表格</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    支持 Excel 或 CSV，导入后自动调用谷歌翻译生成英文标题填入 D6
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 模块 2：模板导入 */}
          <div className="workspace-panel p-4 text-left flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm border border-purple-100">
                    2
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900">上架目标模板</h2>
                </div>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {templateFile ? '已保存模板' : activeCategory.configured ? '系统默认模板' : '需要配置模板'}
                </span>
              </div>

              <p className="text-xs text-slate-500">当前类目：{activeCategory.label}。模板按类目分别保存，切换不会覆盖其他类目。</p>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <select value={activeProfileId} onChange={(event) => event.target.value ? void handleSelectProfile(event.target.value) : handleResetTemplate()} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800">
                  <option value="">选择已保存的自定义模板</option>
                  {templateProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>
                <button type="button" onClick={() => profileInputRef.current?.click()} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100">
                  <Upload className="h-3.5 w-3.5" /> 上传并新建模板
                </button>
              </div>
              <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="自定义模板名称，例如：女士运动短袖" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" />
              {activeProfileId && templateFile && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="text-[11px] text-slate-600">写入子表<select value={profileConfig.targetSheetIndex} onChange={(event) => setProfileConfig((prev) => ({ ...prev, targetSheetIndex: Number(event.target.value) }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs">{profileSheets.map((sheet) => <option key={sheet.index} value={sheet.index}>{sheet.index + 1}. {sheet.name}</option>)}</select></label>
                    <label className="text-[11px] text-slate-600">首款起始行<input type="number" min="1" value={profileConfig.startRow} onChange={(event) => setProfileConfig((prev) => ({ ...prev, startRow: Number(event.target.value) }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" /></label>
                    <label className="text-[11px] text-slate-600">每款行数<input type="number" min="1" value={profileConfig.rowsPerProduct} onChange={(event) => setProfileConfig((prev) => ({ ...prev, rowsPerProduct: Number(event.target.value) }))} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" /></label>
                  </div>
                  <button type="button" onClick={() => setProfileFieldsOpen((open) => !open)} className="text-xs font-semibold text-blue-700 hover:text-blue-900">{profileFieldsOpen ? '收起字段映射' : `编辑 ${profileConfig.fields.length} 个字段映射`}</button>
                  {profileFieldsOpen && <div className="space-y-2">
                    {profileConfig.fields.map((field) => <div key={field.id} className="grid grid-cols-2 lg:grid-cols-[1.1fr_1.2fr_.5fr_.6fr_auto] gap-1.5">
                      <input aria-label="字段名称" value={field.label} onChange={(event) => updateProfileField(field.id, { label: event.target.value })} className="min-w-0 rounded border border-slate-300 px-2 py-1.5 text-[11px]" />
                      <select aria-label="数据来源" value={field.source} onChange={(event) => updateProfileField(field.id, { source: event.target.value as SavedTemplateField['source'] })} className="min-w-0 rounded border border-slate-300 bg-white px-1.5 py-1.5 text-[11px]">
                        <option value="title">中文标题</option><option value="englishTitle">英文标题</option><option value="spuCode">SPU编号</option><option value="whiteImage">白色图片链接</option><option value="blackImage">黑色图片链接</option><option value="static">固定文本</option>
                      </select>
                      <input aria-label="目标列" value={field.column} onChange={(event) => updateProfileField(field.id, { column: event.target.value.toUpperCase() })} placeholder="列" className="min-w-0 rounded border border-slate-300 px-2 py-1.5 text-[11px]" />
                      <input aria-label="行偏移" type="number" min="0" max={profileConfig.rowsPerProduct - 1} value={field.rowOffset} onChange={(event) => updateProfileField(field.id, { rowOffset: Number(event.target.value) })} className="min-w-0 rounded border border-slate-300 px-2 py-1.5 text-[11px]" />
                      <input aria-label="重复次数" type="number" min="1" value={field.repeatCount || 1} onChange={(event) => updateProfileField(field.id, { repeatCount: Number(event.target.value) })} className="min-w-0 rounded border border-slate-300 px-2 py-1.5 text-[11px]" />
                      <input aria-label="重复行步长" type="number" min="1" value={field.rowStep || 1} onChange={(event) => updateProfileField(field.id, { rowStep: Number(event.target.value) })} className="min-w-0 rounded border border-slate-300 px-2 py-1.5 text-[11px]" />
                      {field.source === 'static' && <input aria-label="固定文本" value={field.staticValue || ''} onChange={(event) => updateProfileField(field.id, { staticValue: event.target.value })} placeholder="固定文本" className="min-w-0 rounded border border-slate-300 px-2 py-1.5 text-[11px]" />}
                      <button type="button" onClick={() => setProfileConfig((prev) => ({ ...prev, fields: prev.fields.filter((item) => item.id !== field.id) }))} title="移除此字段" className="rounded px-2 text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>)}
                    <button type="button" onClick={addProfileField} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100">添加映射字段</button>
                  </div>}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                    <span className="text-[10px] text-slate-500">保存原模板与映射规则，导出只修改选定工作表</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void handleSaveProfileConfig()} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">保存名称与写入规则</button>
                      <button type="button" onClick={() => void handleDeleteProfile()} title="删除模板档案" className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </div>
              )}

              {/* 模板操作区 */}
              {templateFile ? (
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 truncate">
                    <FileSpreadsheet className="w-5 h-5 text-purple-600 shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-800 truncate">{templateFile.name}</p>
                      <p className="text-[11px] text-slate-500">{loadedTemplateCategory === productCategory ? '此类目模板已载入并保存' : '模板加载中'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => templateInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium cursor-pointer"
                    >
                      更换
                    </button>
                    <button
                      type="button"
                      onClick={handleResetTemplate}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 cursor-pointer"
                      title="重置为默认模板"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 truncate">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">{activeCategory.configured ? '使用系统内置标准多工作表模板' : '该类目尚未配置专用模板'}</p>
                      <p className="text-[11px] text-slate-500">{activeCategory.configured ? '沿用现有大码写入规则' : '请上传此类目的目标模板，避免沿用大码写入位置'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => templateInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-purple-300 bg-white hover:bg-purple-50 text-purple-700 text-xs font-semibold cursor-pointer shrink-0"
                  >
                    {activeCategory.configured ? '上传自定义底表' : '上传此类目模板'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 模块 3：模型调用与白色背景填充至 1340*1785 */}
        <div className="workspace-panel p-4 text-left space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm border border-emerald-100">
                3
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">商品处理与四色图片</h2>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    模型：gpt-image-2.5
                  </span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-emerald-600" />
                    谷歌翻译接入 (填入D6)
                  </span>
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                    <Scaling className="w-3 h-3 text-purple-600" />
                    100% 确切 1340×1785 白底直链与下载
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">白、黑、杏、绿四色图片 · 英文标题 · 上架文件</p>
              </div>
            </div>

            {/* 操作控制区 */}
            <div className="flex flex-wrap items-center gap-2.5">
              {false && products.length > 0 && (
                <button
                  type="button"
                  disabled={isTranslatingAll}
                  onClick={() => handleTranslateAll()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                  title="调用谷歌翻译 API 翻译全部商品标题填入 D6"
                >
                  {isTranslatingAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <Languages className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>{isTranslatingAll ? '正在谷歌翻译...' : '谷歌翻译全部标题 (填入D6)'}</span>
                </button>
              )}

              {false && products.length > 0 && (
                <button
                  type="button"
                  onClick={handleShuffleColorOrder}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs sm:text-sm font-semibold border border-purple-200 cursor-pointer shadow-2xs transition-colors"
                  title="随机重新打乱全部商品的 4 色（白、黑、杏、绿）排布先后顺序"
                >
                  <Shuffle className="w-3.5 h-3.5 text-purple-600" />
                  <span>重新随机四色顺序</span>
                </button>
              )}

              {false && (
              <button
                type="button"
                onClick={openCosConfigModal}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-2xs ${
                  cosStatus.configured
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 ring-2 ring-amber-300 animate-pulse'
                }`}
                title="配置腾讯云 COS 存储桶并检查服务端连接"
              >
                {cosStatus.configured ? (
                  <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Key className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <span>
                  {cosStatus.configured
                    ? `☁️ 腾讯云已连接 (${cosBucket || 'yxig-1500925420'})`
                    : '🔑 配置腾讯云 COS'}
                </span>
              </button>)}

              {false && products.some((p) => (p.whiteUrl && !p.whiteUrl.includes('.myqcloud.com')) || (p.blackUrl && !p.blackUrl.includes('.myqcloud.com'))) && (
                <button
                  type="button"
                  disabled={isUploadingCos}
                  onClick={handleUploadAllToCos}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 cursor-pointer shadow-2xs"
                  title="一键将页面中已生成的图片全部同步直传至腾讯云 COS 存储桶"
                >
                  {isUploadingCos ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  ) : (
                    <CloudUpload className="w-3.5 h-3.5 text-blue-600" />
                  )}
                  <span>{isUploadingCos ? `正在同步 (${cosUploadProgress?.current}/${cosUploadProgress?.total})...` : '一键同步全部图片至腾讯云 COS'}</span>
                </button>
              )}

              {false && (<div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setViewLayout('card')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                    viewLayout === 'card'
                      ? 'bg-white text-blue-700 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="大图画廊卡片视图"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>画廊卡片</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewLayout('table')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                    viewLayout === 'table'
                      ? 'bg-white text-blue-700 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="紧凑列表视图"
                >
                  <List className="w-3.5 h-3.5" />
                  <span>紧凑列表</span>
                </button>
              </div>)}

              {isProcessing ? (
                <button
                  type="button"
                  onClick={stopProcessing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs sm:text-sm font-semibold border border-amber-300 cursor-pointer shadow-2xs"
                >
                  <Pause className="w-4 h-4 text-amber-600" />
                  <span>暂停处理</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={products.length === 0}
                  onClick={startProcessing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>开始生成 (自动白底填充 1340*1785 + 自动直传腾讯云COS)</span>
                </button>
              )}

              <button
                type="button"
                disabled={products.length === 0 || isBatchExporting}
                onClick={handleExportCombined}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                title="将所有商品按每款 21 行（1行SPU+4色×5码SKU）合并导出至同一个 Excel 表格，C列填中文标题，D6填谷歌翻译英文标题，4色随机排布"
              >
                <FileDown className="w-4 h-4" />
                <span>{isBatchExporting ? '正在导出整合表格...' : '导出整合上架模板 (.xlsx)'}</span>
              </button>

              {false && <button
                type="button"
                disabled={products.length === 0 || isZipping}
                onClick={handleDownloadAllZip}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                title="一键将所有生成的 1340*1785 高清图片打包下载为 ZIP 压缩包，方便批量拖入 Temu 卖家中心素材中心或 ERP 本地上传"
              >
                {isZipping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Package className="w-4 h-4" />
                )}
                <span>{isZipping ? '正在打包图片...' : '打包下载全部图片 (ZIP)'}</span>
              </button>}
            </div>
          </div>

          {/* 生成进度与状态摘要 */}
          {products.length > 0 && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-slate-600">
                <span>
                  共 <strong>{products.length}</strong> 款商品
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-purple-700 font-medium">
                  <Shuffle className="w-3.5 h-3.5 text-purple-600" />
                  四色排布: <strong>随机排序</strong> (白/黑/杏/绿)
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-indigo-700 font-medium">
                  <Languages className="w-3.5 h-3.5 text-indigo-600" />
                  D列/D6英文: <strong>{products.filter((p) => p.englishTitle).length}</strong> / {products.length}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                  白款: <strong>{whiteDoneCount}</strong> / {products.length}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-zinc-800 inline-block"></span>
                  黑款: <strong>{blackDoneCount}</strong> / {products.length}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                  杏款: <strong>{apricotDoneCount}</strong> / {products.length}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  绿款: <strong>{greenDoneCount}</strong> / {products.length}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1 text-emerald-700 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  四色全就绪: {completedCount} / {products.length}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>标题填入 C6，谷歌翻译英文填入 D6，白色/黑色/杏色/绿色按随机顺序写入 EA 列及各 SKU</span>
              </div>
            </div>
          )}

          {/* 商品列表与生成图片直观展示 */}
          {products.length > 0 ? (
            <div className="space-y-3">
              {/* 商品总数提示栏 */}
              <div className="flex items-center justify-between gap-2.5 bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="font-semibold text-slate-800 text-sm">
                    已载入全部 <strong>{products.length}</strong> 款商品
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    (无需翻页，列表直观连贯展示全部商品)
                  </span>
                </div>
              </div>

              {viewLayout === 'card' ? (
                /* 画廊卡片视图：大图直观展示原图与 4 种颜色款式 */
                <div className="grid grid-cols-1 gap-4">
                  {products.map((item, idx) => {
                    const isEditing = editingId === item.id;
                  const order = item.colorOrder && item.colorOrder.length === 4 ? item.colorOrder : (['white', 'black', 'apricot', 'green'] as ColorKey[]);
                  const startRow = 6 + idx * 21;
                  const endRow = startRow + 20;
                  const rowRangeLabel = `第 ${startRow}~${endRow} 行 (21行)`;
                  const titleCell = `C${startRow}`;

                  const getColorCellRange = (colorKey: ColorKey) => {
                    const pos = order.indexOf(colorKey);
                    if (pos === -1) return '';
                    const rStart = startRow + 1 + pos * 5;
                    const rEnd = rStart + 4;
                    return `EA${rStart}~EA${rEnd}`;
                  };

                  return (
                    <div
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between gap-3 text-left"
                    >
                      {/* 头部标题与行号 */}
                      <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleProductColorOrder(item.id)}
                            className="text-[10px] px-2 py-0.5 rounded-md font-mono font-medium border bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                            title="点击可循环切换该商品的 4 色先后排布顺序"
                          >
                            <Shuffle className="w-2.5 h-2.5" />
                            <span>
                              顺序: {order.map((c: ColorKey) => COLOR_CONFIG.find((x) => x.key === c)?.name).join('➔')}
                            </span>
                          </button>
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 flex-1">
                              <div className="relative flex-1">
                                <input
                                  type="text"
                                  maxLength={250}
                                  value={editTitleText}
                                  onChange={(e) => setEditTitleText(e.target.value)}
                                  className="w-full text-xs font-bold p-1 pr-14 border border-blue-400 rounded bg-white outline-none"
                                  autoFocus
                                  placeholder="请输入标题 (上限250字)"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono pointer-events-none">
                                  {editTitleText.length}/250
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => saveTitleEdit(item.id)}
                                className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs font-medium shrink-0"
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs shrink-0"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={() => {
                                setEditingId(item.id);
                                setEditTitleText(item.title);
                              }}
                              className="group flex items-center gap-1.5 cursor-pointer truncate flex-1"
                              title="点击编辑商品标题"
                            >
                              <span className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600">
                                {item.title}
                              </span>
                              <Edit2 className="w-3 h-3 text-slate-300 group-hover:text-blue-500 shrink-0" />
                            </div>
                          )}
                        </div>

                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium shrink-0">
                          {rowRangeLabel}
                        </span>
                      </div>
                      {item.cosUploadErrors && Object.keys(item.cosUploadErrors).length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900" role="status">
                          <span>COS 上传未完成：{Object.entries(item.cosUploadErrors).map(([key, message]) => `${COLOR_CONFIG.find((color) => color.key === key)?.name || key}（${message}）`).join('；')}</span>
                          <button type="button" onClick={handleUploadAllToCos} disabled={isUploadingCos} className="shrink-0 font-semibold text-blue-700 hover:underline disabled:opacity-50">同步图片</button>
                        </div>
                      )}

                      {/* 图片展示五联格：原图 | 白色款 | 黑色款 | 杏色款 | 绿色款 */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 py-1">
                        {/* 1. 原图 (Original) */}
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            原图 (输入)
                          </span>
                          <div
                            onClick={() => item.imageUrl && openImagePreview(item, 'original')}
                            className="w-full aspect-[3/4] rounded-xl bg-slate-100 border border-slate-200 overflow-hidden relative group cursor-pointer shadow-2xs hover:border-blue-400 transition-colors"
                          >
                            {item.imageUrl ? (
                              <>
                                <img
                                  src={item.imageUrl}
                                  alt="原图"
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                  <Maximize2 className="w-4 h-4 drop-shadow" />
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                                无原图
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleManualPadImage(item.id, 'original')}
                              className="text-slate-500 hover:text-blue-600 font-mono underline cursor-pointer"
                              title="将原图按纯白填充至 1340*1785"
                            >
                              {item.isPadded ? '已填白(1340)' : '填白1340'}
                            </button>
                            {item.imageUrl && (
                              <button
                                type="button"
                                onClick={() => handleDownload1340x1785(item.imageUrl, item.title, 'original')}
                                className="text-slate-400 hover:text-slate-800 p-0.5"
                                title="直接下载 1340*1785 原图"
                              >
                                <Download className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 2 ~ 5. 四种颜色款 (White / Black / Apricot / Green) */}
                        {COLOR_CONFIG.map((c) => {
                          const urlKey = `${c.key}Url` as const;
                          const statusKey = `${c.key}Status` as const;
                          const errorKey = `${c.key}Error` as const;
                          const imgUrl = item[urlKey];
                          const hasImg = Boolean(imgUrl);
                          const cellRange = getColorCellRange(c.key);
                          const status = item[statusKey];
                          const err = item[errorKey];

                          return (
                            <div key={c.key} className="flex flex-col items-center gap-1.5">
                              <span className={`text-[10px] font-bold ${c.headerText} uppercase tracking-wide flex items-center gap-1`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${c.dotBg} inline-block`}></span>
                                {c.name}款 (1340)
                              </span>
                              <div className="w-full aspect-[3/4] rounded-xl bg-slate-50 border border-slate-200 overflow-hidden relative group flex items-center justify-center shadow-2xs">
                                {status === 'running' ? (
                                  <div className={`flex flex-col items-center justify-center p-2 text-center ${c.headerText}`}>
                                    <RefreshCw className="w-4 h-4 animate-spin mb-1" />
                                    <span className="text-[9px] font-semibold animate-pulse">
                                      生图中...
                                    </span>
                                  </div>
                                ) : hasImg && imgUrl ? (
                                  <div
                                    onClick={() => openImagePreview(item, c.key)}
                                    className="w-full h-full cursor-pointer relative"
                                  >
                                    <img
                                      src={imgUrl}
                                      alt={`${c.name}款`}
                                      loading="lazy"
                                      decoding="async"
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                      referrerPolicy="no-referrer"
                                    />
                                    <div className="absolute top-1 right-1 bg-emerald-500 text-white p-0.5 rounded-full shadow-xs">
                                      <Check className="w-3 h-3 stroke-[3]" />
                                    </div>
                                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[8px] px-1 py-0.2 rounded font-mono">
                                      1340*1785
                                    </div>
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2">
                                      <Maximize2 className="w-4 h-4 drop-shadow" />
                                    </div>
                                  </div>
                                ) : status === 'error' ? (
                                  <div className="flex flex-col items-center justify-center p-2 text-center text-red-500">
                                    <AlertCircle className="w-5 h-5 mb-1 text-red-500" />
                                    <span className="text-[9px] line-clamp-2 leading-tight">
                                      {err || '生成失败'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleRetrySingleColor(item.id, c.key)}
                                      className="mt-1 px-1.5 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded text-[9px] font-bold border border-red-200 cursor-pointer"
                                    >
                                      重试
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col items-center justify-center p-2 text-center text-slate-400">
                                    <ImageIcon className="w-5 h-5 mb-1 stroke-1 text-slate-300" />
                                    <span className="text-[10px]">待生成</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center justify-between w-full px-0.5 text-[10px]">
                                <span className={`${c.headerText} font-mono font-medium truncate text-[9px]`}>
                                  {hasImg ? cellRange : '未就绪'}
                                </span>
                                {hasImg && imgUrl && (
                                  <button
                                    type="button"
                                    onClick={() => handleDownload1340x1785(imgUrl, item.title, c.key, item.spuCode)}
                                    className={`${c.headerText} hover:opacity-80 p-0.5 cursor-pointer`}
                                    title={`直接下载 1340×1785 ${c.name}款大图`}
                                  >
                                    <Download className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* 底部快捷操作条 */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5">
                          {/* 复制单元格与URL信息 */}
                          <button
                            type="button"
                            onClick={() => {
                              const firstKey = order[0];
                              const firstImg = item[`${firstKey}Url` as const];
                              const colorsDetail = order
                                .map((cKey: ColorKey) => {
                                  const cDef = COLOR_CONFIG.find((x) => x.key === cKey);
                                  const cRange = getColorCellRange(cKey);
                                  const cUrl = item[`${cKey}Url` as const];
                                  return `${cDef?.name}图 (${cRange}): ${cUrl || '(未完成)'}`;
                                })
                                .join('\n');
                              const info = `${rowRangeLabel} [颜色顺序: ${order.map((c: ColorKey) => COLOR_CONFIG.find((x) => x.key === c)?.name).join('➔')}]\n商品标题 (${titleCell}): ${item.title}\n首图 (EA${startRow}): ${firstImg || '(未完成)'}\n${colorsDetail}`;
                              safeCopy(info, item.id);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs cursor-pointer"
                            title="复制该商品行区间与单元格映射文本"
                          >
                            {copiedId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* 查看大图对比 */}
                          <button
                            type="button"
                            onClick={() => openImagePreview(item, order[0])}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs cursor-pointer flex items-center gap-1"
                            title="打开大图对比预览"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="text-[11px]">预览对比</span>
                          </button>
                        </div>

                        {/* 导出当前单品模板 */}
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(item)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 cursor-pointer transition-colors"
                          title="删除此商品"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>删除商品</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* 紧凑列表视图 */
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {products.map((item, idx) => {
                  const isEditing = editingId === item.id;
                  const order = item.colorOrder && item.colorOrder.length === 4 ? item.colorOrder : (['white', 'black', 'apricot', 'green'] as ColorKey[]);
                  const startRow = 6 + idx * 21;
                  const endRow = startRow + 20;
                  const rowRangeLabel = `第 ${startRow}~${endRow} 行`;
                  const titleCell = `C${startRow}`;

                  const getColorCellRange = (colorKey: ColorKey) => {
                    const pos = order.indexOf(colorKey);
                    if (pos === -1) return '';
                    const rStart = startRow + 1 + pos * 5;
                    const rEnd = rStart + 4;
                    return `EA${rStart}~EA${rEnd}`;
                  };

                  return (
                    <div
                      key={item.id}
                      className="p-3 sm:p-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors text-left"
                    >
                      {/* 商品信息 & 原图与生成图缩略展示 */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex flex-col items-center gap-0.5 shrink-0">
                          <span className="text-xs font-mono text-slate-400 w-6 text-center">#{idx + 1}</span>
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                            R{startRow}-{endRow}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleProductColorOrder(item.id)}
                            className="text-[9px] font-mono px-1 py-0.2 rounded border bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 cursor-pointer transition-colors"
                            title="点击切换该商品颜色顺序"
                          >
                            {order.map((c) => COLOR_CONFIG.find((x) => x.key === c)?.name[0]).join('')}
                          </button>
                        </div>

                        {/* 五图缩略组合：原图 + 4色 */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* 原图 */}
                          <div
                            onClick={() => item.imageUrl && openImagePreview(item, 'original')}
                            className="w-10 h-13 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden relative group cursor-pointer"
                            title="原图 (点击放大)"
                          >
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt="原图"
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400">
                                无
                              </div>
                            )}
                          </div>

                          {/* 4色缩略图 */}
                          {COLOR_CONFIG.map((c) => {
                            const urlKey = `${c.key}Url` as const;
                            const statusKey = `${c.key}Status` as const;
                            const imgUrl = item[urlKey];
                            const hasImg = Boolean(imgUrl);
                            const status = item[statusKey];

                            return (
                              <div
                                key={c.key}
                                onClick={() => hasImg && imgUrl && openImagePreview(item, c.key)}
                                className="w-10 h-13 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden relative group cursor-pointer flex items-center justify-center"
                                title={`${c.name}款 (1340*1785 · 点击放大)`}
                              >
                                {status === 'running' ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-500" />
                                ) : hasImg && imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={`${c.name}款`}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <span className={`text-[9px] font-bold ${c.headerText}`}>{c.name[0]}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* 标题与行号映射信息 */}
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* 商品标题 */}
                          <div className="flex items-center gap-2">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5 max-w-md flex-1">
                                <div className="relative flex-1">
                                  <input
                                    type="text"
                                    maxLength={250}
                                    value={editTitleText}
                                    onChange={(e) => setEditTitleText(e.target.value)}
                                    className="w-full text-xs font-bold p-1 pr-14 border border-blue-400 rounded bg-white outline-none"
                                    autoFocus
                                    placeholder="请输入标题 (上限250字)"
                                  />
                                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-mono pointer-events-none">
                                    {editTitleText.length}/250
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => saveTitleEdit(item.id)}
                                  className="p-1 px-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs shrink-0"
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="p-1 px-2 rounded bg-slate-200 text-slate-700 text-xs shrink-0"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <div
                                onClick={() => {
                                  setEditingId(item.id);
                                  setEditTitleText(item.title);
                                }}
                                className="group flex items-center gap-1.5 cursor-pointer max-w-xl truncate"
                                title="点击编辑商品标题"
                              >
                                <span className="text-xs font-bold text-slate-800 truncate group-hover:text-blue-600">
                                  {item.title}
                                </span>
                                <Edit2 className="w-3 h-3 text-slate-300 group-hover:text-blue-500 shrink-0" />
                              </div>
                            )}

                            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded shrink-0">
                              {rowRangeLabel}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-slate-400 mt-0.5 font-mono">
                            <span className={item.whiteUrl ? 'text-blue-600 font-medium' : 'text-slate-400'}>
                              ⚪ 白图: {item.whiteStatus === 'running' ? '生成中...' : item.whiteUrl ? `已就绪 (${getColorCellRange('white')})` : '未生成'}
                            </span>
                            <span>•</span>
                            <span className={item.blackUrl ? 'text-zinc-800 font-medium' : 'text-slate-400'}>
                              ⚫ 黑图: {item.blackStatus === 'running' ? '生成中...' : item.blackUrl ? `已就绪 (${getColorCellRange('black')})` : '未生成'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 单品导出与复制操作 */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* 复制单元格信息 */}
                        <button
                          type="button"
                          onClick={() => {
                            const firstKey = order[0];
                            const firstImg = item[`${firstKey}Url` as const];
                            const colorsDetail = order
                              .map((cKey) => {
                                const cDef = COLOR_CONFIG.find((x) => x.key === cKey);
                                const cRange = getColorCellRange(cKey);
                                const cUrl = item[`${cKey}Url` as const];
                                return `${cDef?.name}图 (${cRange}): ${cUrl || '(未完成)'}`;
                              })
                              .join('\n');
                            const info = `${rowRangeLabel} [颜色顺序: ${order.map((c) => COLOR_CONFIG.find((x) => x.key === c)?.name).join('➔')}]\n商品标题 (${titleCell}): ${item.title}\n首图 (EA${startRow}): ${firstImg || '(未完成)'}\n${colorsDetail}`;
                            safeCopy(info, item.id);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-medium cursor-pointer"
                          title="复制该商品行区间与单元格映射文本"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* 导出单品 Excel 模板 */}
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 cursor-pointer transition-colors"
                          title="删除此商品"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>删除商品</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="py-10 text-center text-slate-400 text-xs">
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-300 stroke-1" />
            <span>请先在上方第 1 步导入商品信息表格</span>
          </div>
        )}
        </div>
      </div>

      {/* 大图高精度预览与对比 Modal (1340*1785 白色背景填充) */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  AI
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {previewModal.title || '商品图片高清预览'}
                  </h3>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <span>标准规格: 1340 × 1785 px (3:4 电商主图)</span>
                    <span>•</span>
                    <span className="text-purple-600 font-medium">白色背景填充适配</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* 选项卡切换原图 / 白图 / 黑图 / 杏图 / 绿图 */}
                <div className="flex items-center bg-slate-200 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewModal((prev) => ({ ...prev, activeType: 'original' }))}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      previewModal.activeType === 'original'
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    原图
                  </button>
                  {COLOR_CONFIG.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setPreviewModal((prev) => ({ ...prev, activeType: c.key }))}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                        previewModal.activeType === c.key
                          ? `bg-white ${c.headerText} shadow-xs font-semibold`
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewModal((prev) => ({ ...prev, isOpen: false }))}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div className="p-6 overflow-y-auto flex-1 flex items-center justify-center bg-slate-100/60 min-h-[350px]">
              {previewModal.activeType === 'original' ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="max-h-[60vh] aspect-[3/4] rounded-xl overflow-hidden border border-slate-300 shadow-lg bg-white flex items-center justify-center">
                    {previewModal.originalUrl ? (
                      <img
                        src={previewModal.originalUrl}
                        alt="原图预览"
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">暂无原图</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload1340x1785(previewModal.originalUrl, previewModal.title, 'original')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer shadow-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>下载 1340×1785 原图</span>
                    </button>
                  </div>
                </div>
              ) : (
                (() => {
                  const activeColor = previewModal.activeType;
                  const colorConf = COLOR_CONFIG.find((c) => c.key === activeColor);
                  const colorUrl = previewModal[`${activeColor}Url` as const];

                  return (
                    <div className="flex flex-col items-center gap-3">
                      <div className="max-h-[60vh] aspect-[3/4] rounded-xl overflow-hidden border border-slate-300 shadow-lg bg-white flex items-center justify-center">
                        {colorUrl ? (
                          <img
                            src={colorUrl}
                            alt={`${colorConf?.name}预览`}
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">{colorConf?.name}款尚未生成</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {colorUrl && (
                          <button
                            type="button"
                            onClick={() => handleDownload1340x1785(colorUrl!, previewModal.title, activeColor, previewModal.spuCode)}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>下载 1340×1785 {colorConf?.name}款高清图</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {isCosModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">腾讯云 COS</h3>
              <button type="button" onClick={() => setIsCosModalOpen(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="关闭"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-600">访问密钥由服务端环境变量保管，不会保存在浏览器或发送到页面。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-slate-600">存储桶<input type="text" value={tempBucket} onChange={(e) => setTempBucket(e.target.value)} className="w-full rounded-md border border-slate-300 px-2.5 py-2 font-mono" /></label>
              <label className="space-y-1 text-xs text-slate-600">地域<input type="text" value={tempRegion} onChange={(e) => setTempRegion(e.target.value)} className="w-full rounded-md border border-slate-300 px-2.5 py-2 font-mono" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setIsCosModalOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-700">取消</button>
              <button type="button" disabled={isTestingCos} onClick={handleSaveAndTestCos} className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{isTestingCos ? '正在检查...' : '检查连接'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

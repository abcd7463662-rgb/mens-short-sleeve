import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  Copy,
  Check,
  Edit2,
  X,
  Maximize2,
  ExternalLink,
  Globe,
  Sliders,
  Settings2,
  Link2,
  Image as ImageIcon,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import {
  parseProductTable,
  exportProcessedProductsExcel,
  exportOriginalTableWithColors,
  TableParseResult,
  TableColumnOption,
  ColumnMappingOverrides,
  isHttpUrl,
} from './tableParser';
import {
  downloadImageAs1340x1785,
} from './imagePadding';
import {
  generateProductTemplateFile,
  generateMultiProductTemplateFile,
  downloadTemplateFile,
  ColorKey,
  ColorMode,
  COLOR_NAMES,
} from '../templateGenerator';
import { translateTitleWithGoogle, translateBatchTitlesWithGoogle } from '../../utils/translator';
import { cleanChineseTitle, cleanEnglishTitle } from '../../utils/titleCleaner';
import {
  saveTemplateFile,
  loadTemplateFile,
  clearTemplateFile,
  uploadTemplateToServer,
  downloadTemplateFromServer,
  deleteServerTemplate,
} from '../../utils/templateStorage';

export interface ProductItem {
  id: string;
  rowIndex: number;
  title: string;
  englishTitle?: string;
  isTranslating?: boolean;
  imageUrl: string;
  blackUrl?: string;
  whiteUrl?: string;
  selectedColor: 'black' | 'white'; // 人为判定颜色：'black' (默认黑色) | 'white' (白色)
  firstColor?: ColorKey;
  colorOrder?: ColorKey[];
}

interface ImageModifierViewProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

interface PreviewModalData {
  isOpen: boolean;
  title: string;
  englishTitle?: string;
  originalUrl: string;
  selectedColor: 'black' | 'white';
}

export const ImageModifierView: React.FC<ImageModifierViewProps> = ({ onShowToast }) => {
  // 1. 商品信息导入状态
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [tableFile, setTableFile] = useState<File | null>(null);
  const [isParsingTable, setIsParsingTable] = useState<boolean>(false);
  const [tableResult, setTableResult] = useState<TableParseResult | null>(null);

  // 默认填入颜色全局基准：默认为黑色
  const [defaultBatchColor, setDefaultBatchColor] = useState<'black' | 'white'>('black');

  // 列映射配置状态
  const [showMappingPanel, setShowMappingPanel] = useState<boolean>(false);
  const [columnOverrides, setColumnOverrides] = useState<ColumnMappingOverrides>({});

  // 2. 模板导入状态
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateSavedAt, setTemplateSavedAt] = useState<number | null>(null);

  // 3. 处理与导出状态
  const [isBatchExporting, setIsBatchExporting] = useState<boolean>(false);
  const [isExportingOriginal, setIsExportingOriginal] = useState<boolean>(false);
  const [isTranslatingAll, setIsTranslatingAll] = useState<boolean>(false);
  const [translationProgress, setTranslationProgress] = useState<{
    done: number;
    total: number;
    failed: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState<string>('');
  const [editingUrlItem, setEditingUrlItem] = useState<{ id: string; url: string } | null>(null);
  const [viewLayout, setViewLayout] = useState<'card' | 'table'>('card');
  const [colorFilter, setColorFilter] = useState<'all' | 'black' | 'white'>('all');

  // 极速看图判定模式 (Rapid Review Mode)
  const [rapidReviewIndex, setRapidReviewIndex] = useState<number | null>(null);

  // 大图弹窗预览状态
  const [previewModal, setPreviewModal] = useState<PreviewModalData>({
    isOpen: false,
    title: '',
    originalUrl: '',
    selectedColor: 'black',
  });

  const tableInputRef = useRef<HTMLInputElement | null>(null);
  const templateInputRef = useRef<HTMLInputElement | null>(null);

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
      onShowToast('复制失败，请手动选取复制', 'error');
    }
  };

  // 人为选择某一件衣服是黑色或是白色
  const handleSetItemColor = useCallback(
    (id: string, color: 'black' | 'white', notify: boolean = true) => {
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          return {
            ...p,
            selectedColor: color,
            blackUrl: color === 'black' ? (p.imageUrl || p.blackUrl) : p.blackUrl,
            whiteUrl: color === 'white' ? (p.imageUrl || p.whiteUrl) : p.whiteUrl,
            firstColor: color,
          };
        })
      );
      if (notify) {
        onShowToast(`已判定为【${color === 'black' ? '黑色衣服' : '白色衣服'}】，表格颜色部分已填入“${color === 'black' ? '黑色' : '白色'}”！`, 'success');
      }
    },
    [onShowToast]
  );

  // 全局批量设定全部衣服为黑色或白色
  const handleBatchSetAll = (color: 'black' | 'white') => {
    setDefaultBatchColor(color);
    setProducts((prev) =>
      prev.map((p) => ({
        ...p,
        selectedColor: color,
        blackUrl: color === 'black' ? (p.imageUrl || p.blackUrl) : p.blackUrl,
        whiteUrl: color === 'white' ? (p.imageUrl || p.whiteUrl) : p.whiteUrl,
        firstColor: color,
      }))
    );
    onShowToast(
      `已将全部 ${products.length} 款衣服人为判定为【${color === 'black' ? '黑色' : '白色'}】，表格颜色部分统一填入“${color === 'black' ? '黑色' : '白色'}”！`,
      'success'
    );
  };

  // 智能根据商品标题文字包含“白”或“黑”进行初步预判
  const handleSmartDetectFromTitle = () => {
    let blackCount = 0;
    let whiteCount = 0;
    setProducts((prev) =>
      prev.map((p) => {
        const text = (p.title + ' ' + (p.englishTitle || '')).toLowerCase();
        let decidedColor: 'black' | 'white' = 'black'; // 默认黑色
        if (text.includes('白') || text.includes('white') || text.includes('米白')) {
          decidedColor = 'white';
          whiteCount++;
        } else {
          decidedColor = 'black';
          blackCount++;
        }
        return {
          ...p,
          selectedColor: decidedColor,
          blackUrl: decidedColor === 'black' ? (p.imageUrl || p.blackUrl) : p.blackUrl,
          whiteUrl: decidedColor === 'white' ? (p.imageUrl || p.whiteUrl) : p.whiteUrl,
          firstColor: decidedColor,
        };
      })
    );
    onShowToast(`智能初判完成：识别出黑色款 ${blackCount} 件、白色款 ${whiteCount} 件！您可继续人工校对。`, 'info');
  };

  // --- 1. 商品信息导入 ---
  const handleTableUpload = async (file: File, overrides?: ColumnMappingOverrides) => {
    try {
      setIsParsingTable(true);
      const res = await parseProductTable(file, 0, overrides, 'black');
      setTableFile(file);
      setTableResult(res);

      const items: ProductItem[] = res.items.map((it) => {
        const cleanedTitle = cleanChineseTitle(it.title || `商品_${it.rowIndex}`) || `商品_${it.rowIndex}`;
        // 默认判定为黑色款（默认黑色）
        const defaultColor: 'black' | 'white' = 'black';
        return {
          id: it.id,
          rowIndex: it.rowIndex,
          title: cleanedTitle,
          englishTitle: it.englishTitle,
          imageUrl: it.imageUrl,
          blackUrl: it.blackUrl || it.imageUrl,
          whiteUrl: it.whiteUrl || '',
          selectedColor: defaultColor,
          firstColor: defaultColor,
          colorOrder: [defaultColor],
        };
      });

      setProducts(items);

      // 同步当前映射列覆盖状态
      setColumnOverrides({
        titleColIndex: res.detectedTitleColIndex,
        englishTitleColIndex: res.detectedEnglishTitleColIndex !== -1 ? res.detectedEnglishTitleColIndex : undefined,
        imageColIndex: res.detectedImageColIndex,
        blackColIndex: res.detectedBlackColIndex !== -1 ? res.detectedBlackColIndex : undefined,
        whiteColIndex: res.detectedWhiteColIndex !== -1 ? res.detectedWhiteColIndex : undefined,
        colorColIndex: res.detectedColorColIndex !== -1 ? res.detectedColorColIndex : undefined,
      });

      onShowToast(
        `成功读取 ${res.fileName}，识别出 ${items.length} 款衣服图片！默认判定为黑色款，您可按需选择衣服为黑色或白色。`,
        'success'
      );

      // 自动触发缺失英文标题的谷歌翻译（统一从这里发起，避免重复请求把接口打到限流）
      await autoTranslateTitles(items);
    } catch (err: any) {
      onShowToast(err.message || '解析表格失败，请检查文件格式', 'error');
    } finally {
      setIsParsingTable(false);
    }
  };

  // 更新列映射并重新提取数据
  const handleUpdateColumnMapping = (key: keyof ColumnMappingOverrides, colIdx: number) => {
    const updated = {
      ...columnOverrides,
      [key]: colIdx === -1 ? undefined : colIdx,
    };
    setColumnOverrides(updated);
    if (tableFile) {
      handleTableUpload(tableFile, updated);
    }
  };

  // 批量异步进行谷歌翻译
  const autoTranslateTitles = async (currentItems: ProductItem[]) => {
    const needsTranslation = currentItems.filter((it) => !it.englishTitle || it.englishTitle === it.title);
    if (needsTranslation.length === 0) {
      setTranslationProgress({ done: 0, total: 0, failed: 0 });
      return;
    }

    setIsTranslatingAll(true);
    const uniqueTitleCount = new Set(needsTranslation.map((it) => cleanChineseTitle(it.title))).size;
    setTranslationProgress({ done: 0, total: uniqueTitleCount, failed: 0 });
    onShowToast(`正在翻译 ${needsTranslation.length} 条商品标题，请稍候...`, 'info');
    try {
      const titles = needsTranslation.map((it) => it.title);
      const translations = await translateBatchTitlesWithGoogle(titles, 'en', (done, total) => {
        setTranslationProgress((prev) => ({ done, total, failed: prev?.failed || 0 }));
      });
      const translationMap = new Map<string, string>();
      titles.forEach((t, i) => {
        if (translations[i]) translationMap.set(t, translations[i]);
      });

      setProducts((prev) =>
        prev.map((it) => {
          const translated = translationMap.get(it.title);
          if (translated) {
            return {
              ...it,
              englishTitle: cleanEnglishTitle(translated),
            };
          }
          return it;
        })
      );

      const doneCount = needsTranslation.filter((it) => translationMap.has(it.title)).length;
      const missingCount = needsTranslation.length - doneCount;
      setTranslationProgress({ done: needsTranslation.length, total: needsTranslation.length, failed: missingCount });
      if (missingCount > 0) {
        onShowToast(
          `已翻译 ${doneCount} 条，仍有 ${missingCount} 条未成功（谷歌接口限流）。点击右下角「重新翻译」可重试。`,
          'error'
        );
      } else {
        onShowToast(`全部 ${doneCount} 条标题翻译完成！`, 'success');
      }
    } catch (err) {
      console.warn('Batch translation warning:', err);
      setTranslationProgress({ done: 0, total: needsTranslation.length, failed: needsTranslation.length });
      onShowToast('批量翻译失败，可点击「重新翻译」重试', 'error');
    } finally {
      setIsTranslatingAll(false);
    }
  };

  // --- 2. 模板导入 ---
  const handleTemplateUpload = async (file: File) => {
    setTemplateFile(file);
    setTemplateSavedAt(Date.now());
    onShowToast(`正在保存上架底表「${file.name}」...`, 'info');

    // 本地副本先落盘，保证服务器不可达时也能接着用
    try {
      await saveTemplateFile(file);
    } catch (err) {
      console.warn('保存模板到本机失败:', err);
    }

    const serverResult = await uploadTemplateToServer(file);
    if (serverResult) {
      onShowToast(
        serverResult.backedUp
          ? `底表「${file.name}」已永久保存到 GitHub，换设备、重新部署都不会丢`
          : serverResult.backupConfigured
          ? `底表「${file.name}」已保存，但 GitHub 备份失败，可稍后重新上传一次`
          : `底表「${file.name}」已保存到服务器。当前未配置 GitHub 备份，重新部署后仍在，需要长期保存请按说明配置`,
        'success'
      );
    } else {
      onShowToast(
        `底表「${file.name}」已保存在本机，但未能同步到服务器，下次打开仍可使用`,
        'error'
      );
    }
  };

  const handleResetTemplate = async () => {
    setTemplateFile(null);
    setTemplateSavedAt(null);
    await clearTemplateFile();
    await deleteServerTemplate();
    onShowToast('已重置为系统内置标准模板，本机、服务器与 GitHub 备份均已清除', 'info');
  };

  // 页面打开时恢复上次保存的底表
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 优先用服务器上的版本，这样换浏览器/换电脑也能自动拿到
      const fromServer = await downloadTemplateFromServer();
      if (cancelled) return;
      if (fromServer) {
        setTemplateFile((prev) => prev ?? fromServer);
        setTemplateSavedAt((prev) => prev ?? Date.now());
        // 顺手刷新本地副本，保证和服务端一致
        saveTemplateFile(fromServer).catch(() => undefined);
        return;
      }

      const local = await loadTemplateFile();
      if (cancelled || !local) return;
      setTemplateFile((prev) => prev ?? local.file);
      setTemplateSavedAt((prev) => prev ?? local.savedAt);

      // 服务端没有（例如刚重新部署过），用本地副本自动补回去
      const healed = await uploadTemplateToServer(local.file);
      if (!cancelled && healed) {
        onShowToast('已从本机备份自动恢复上架底表到服务器', 'success');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onShowToast]);

  // 保存图片链接修改
  const handleSaveUrlEdit = () => {
    if (!editingUrlItem) return;
    const { id, url } = editingUrlItem;
    const cleanUrl = url.trim();

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          imageUrl: cleanUrl,
          blackUrl: p.selectedColor === 'black' ? cleanUrl : p.blackUrl,
          whiteUrl: p.selectedColor === 'white' ? cleanUrl : p.whiteUrl,
        };
      })
    );

    setEditingUrlItem(null);
    onShowToast('图片链接已成功更新！', 'success');
  };

  // 导出单款商品模板
  const handleExportSingle = async (item: ProductItem, index: number) => {
    try {
      const cleanedTitle = cleanChineseTitle(item.title);
      const cleanedEnglish = cleanEnglishTitle(item.englishTitle || cleanedTitle);
      const chosenColor = item.selectedColor;
      const chosenColorName = chosenColor === 'black' ? '黑色' : '白色';

      const res = await generateMultiProductTemplateFile({
        products: [
          {
            title: cleanedTitle,
            englishTitle: cleanedEnglish,
            blackImageUrl: chosenColor === 'black' ? item.imageUrl : '',
            whiteImageUrl: chosenColor === 'white' ? item.imageUrl : '',
            selectedColor: chosenColor,
            firstColor: chosenColor,
          },
        ],
        baseTemplateFile: templateFile || undefined,
        customFilename: `${(cleanedTitle || `商品_${index + 1}`).replace(/[/\\?%*:|"<>]/g, '_')}_${chosenColorName}款_上架模板.xlsx`,
      });

      downloadTemplateFile(res.outputBlob, res.fileName);
      onShowToast(`成功导出「${cleanedTitle}」上架模板（EE 列填入“${chosenColorName}”，FV 列填入图片直链）！`, 'success');
    } catch (err: any) {
      onShowToast(err.message || '导出模板失败', 'error');
    }
  };

  // 导出全部商品整合在同一个表格内 (标准上架模板)
  const handleExportCombined = async () => {
    if (products.length === 0) {
      onShowToast('请先在第 1 步导入商品信息', 'error');
      return;
    }

    setIsBatchExporting(true);
    try {
      const inputs = products.map((p) => {
        const cTitle = p.title || '';
        const eTitle = p.englishTitle || cleanChineseTitle(cTitle);
        const chosenColor = p.selectedColor;
        return {
          title: cTitle,
          englishTitle: eTitle,
          blackImageUrl: chosenColor === 'black' ? p.imageUrl : (p.blackUrl || p.imageUrl),
          whiteImageUrl: chosenColor === 'white' ? p.imageUrl : (p.whiteUrl || p.imageUrl),
          selectedColor: chosenColor,
          firstColor: chosenColor,
        };
      });

      const res = await generateMultiProductTemplateFile({
        products: inputs,
        baseTemplateFile: templateFile || undefined,
        customFilename:
          products.length > 1
            ? `电商多商品汇总上架模板_共${products.length}款(已填黑白颜色).xlsx`
            : `${(inputs[0]?.title || '商品').slice(0, 20).replace(/[/\\?%*:|"<>]/g, '_')}_标准上架模板.xlsx`,
      });

      downloadTemplateFile(res.outputBlob, res.fileName);

      const blackTotal = products.filter((p) => p.selectedColor === 'black').length;
      const whiteTotal = products.filter((p) => p.selectedColor === 'white').length;

      onShowToast(
        `成功导出整合模板！已将全部 ${products.length} 款衣服填入（黑色 ${blackTotal} 款、白色 ${whiteTotal} 款），EE 列已填入所选颜色，FV 列已填入对应图片直链！`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err.message || '整合导出模板失败', 'error');
    } finally {
      setIsBatchExporting(false);
    }
  };

  // 导出直接回填原表格（将选好的黑色或白色写回用户上传的表格）
  const handleExportBackToOriginalTable = async () => {
    if (!tableFile || products.length === 0) {
      onShowToast('请先上传商品表格', 'error');
      return;
    }

    setIsExportingOriginal(true);
    try {
      const itemsToUpdate = products.map((p) => ({
        id: p.id,
        rowIndex: p.rowIndex,
        selectedColor: p.selectedColor,
        colorName: p.selectedColor === 'black' ? '黑色' : '白色',
      }));

      await exportOriginalTableWithColors(
        tableFile,
        itemsToUpdate,
        tableResult?.activeSheetIndex || 0,
        columnOverrides.colorColIndex
      );

      const blackTotal = products.filter((p) => p.selectedColor === 'black').length;
      const whiteTotal = products.filter((p) => p.selectedColor === 'white').length;

      onShowToast(
        `已成功将人为选好的颜色（黑色 ${blackTotal} 款、白色 ${whiteTotal} 款）回填入原表格颜色列并完成导出！`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err.message || '回填原表格导出失败', 'error');
    } finally {
      setIsExportingOriginal(false);
    }
  };

  // 导出链接与颜色映射对照 Excel
  const handleExportMappingExcel = () => {
    if (products.length === 0) {
      onShowToast('暂无商品数据可供导出', 'error');
      return;
    }
    const data = products.map((p) => {
      const colorName = p.selectedColor === 'black' ? '黑色' : '白色';
      return {
        title: p.title,
        originalUrl: p.imageUrl,
        selectedColor: p.selectedColor,
        colorName: colorName as '黑色' | '白色',
        cjColumnValue: colorName,
        eaColumnValue: p.imageUrl,
      };
    });
    exportProcessedProductsExcel(data, `商品黑白衣服图片与颜色填入对照表_共${products.length}款.xlsx`);
    onShowToast('成功导出黑白颜色与图片对照清单！', 'success');
  };

  // 打开大图预览弹窗
  const openImagePreview = (p: ProductItem) => {
    setPreviewModal({
      isOpen: true,
      title: p.title,
      englishTitle: p.englishTitle,
      originalUrl: p.imageUrl,
      selectedColor: p.selectedColor,
    });
  };

  // 保存标题编辑
  const saveTitleEdit = async (id: string) => {
    if (!editTitleText.trim()) return;
    const cleaned = cleanChineseTitle(editTitleText.trim()) || editTitleText.trim();
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, title: cleaned, isTranslating: true } : p))
    );
    setEditingId(null);
    onShowToast('商品标题已更新，正在更新英文翻译...', 'success');

    try {
      const { translatedText } = await translateTitleWithGoogle(cleaned, 'en');
      const cleanEng = cleanEnglishTitle(translatedText);
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, englishTitle: cleanEng, isTranslating: false } : p))
      );
      onShowToast('翻译成功！', 'success');
    } catch (err: any) {
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, isTranslating: false } : p))
      );
      onShowToast(`翻译失败: ${err.message || '未知错误'}`, 'error');
    }
  };

  // 键盘快捷键监听（针对全屏极速看图判定模式）
  useEffect(() => {
    if (rapidReviewIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const currentItem = products[rapidReviewIndex];
      if (!currentItem) return;

      if (e.key === '1' || e.key === 'b' || e.key === 'B') {
        // 判定为黑色
        e.preventDefault();
        handleSetItemColor(currentItem.id, 'black', false);
        onShowToast(`[#${rapidReviewIndex + 1}] 判定为黑色衣服`, 'success');
        if (rapidReviewIndex < products.length - 1) {
          setRapidReviewIndex(rapidReviewIndex + 1);
        }
      } else if (e.key === '2' || e.key === 'w' || e.key === 'W') {
        // 判定为白色
        e.preventDefault();
        handleSetItemColor(currentItem.id, 'white', false);
        onShowToast(`[#${rapidReviewIndex + 1}] 判定为白色衣服`, 'success');
        if (rapidReviewIndex < products.length - 1) {
          setRapidReviewIndex(rapidReviewIndex + 1);
        }
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        if (rapidReviewIndex < products.length - 1) {
          setRapidReviewIndex(rapidReviewIndex + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (rapidReviewIndex > 0) {
          setRapidReviewIndex(rapidReviewIndex - 1);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setRapidReviewIndex(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rapidReviewIndex, products, handleSetItemColor, onShowToast]);

  // 统计数据
  const blackCount = useMemo(() => products.filter((p) => p.selectedColor === 'black').length, [products]);
  const whiteCount = useMemo(() => products.filter((p) => p.selectedColor === 'white').length, [products]);
  const translatedCount = useMemo(
    () => products.filter((p) => p.englishTitle && p.englishTitle !== p.title).length,
    [products]
  );

  // 筛选后的商品列表
  const filteredProducts = useMemo(() => {
    if (colorFilter === 'black') {
      return products.filter((p) => p.selectedColor === 'black');
    }
    if (colorFilter === 'white') {
      return products.filter((p) => p.selectedColor === 'white');
    }
    return products;
  }, [products, colorFilter]);

  return (
    <div className="w-full max-w-7xl mx-auto py-6 px-4 sm:px-6">
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

      {/* 主界面空间 */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 pb-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">男士短袖 · 商品上架</h1>
            <p className="mt-0.5 text-xs text-slate-500">导入商品表格，确认颜色后导出上架文件</p>
          </div>
          {products.length > 0 && <div className="flex flex-wrap items-center gap-2">
              {products.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRapidReviewIndex(0)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                  title="开启全屏看图，使用快捷键 1(黑) / 2(白) 快速连审"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>快速判色</span>
                </button>
              )}
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">批量设置</summary>
                <div className="absolute right-0 top-full z-20 mt-1 flex min-w-40 flex-col gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={() => handleBatchSetAll('black')}
                  className="rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                  title="将全部商品都设为黑色衣服"
                >
                  全部设为黑色
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchSetAll('white')}
                  className="rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                  title="将全部商品都设为白色衣服"
                >
                  全部设为白色
                </button>
                <button
                  type="button"
                  onClick={handleSmartDetectFromTitle}
                  className="flex items-center gap-1.5 rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100"
                  title="按标题文字中的‘白’‘黑’进行初步预判"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>标题关键词初判</span>
                </button>
                </div>
              </details>
            </div>}
        </div>

        {/* 步骤 1 & 2 并排卡片 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 模块 1：商品表格上传与直链识别 */}
          <div className="workspace-panel flex flex-col justify-between p-4 text-left">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">商品表格</h2>
                </div>
                {tableFile && (
                  <span className="text-xs text-slate-500">
                    已识别 {products.length} 款
                  </span>
                )}
              </div>

              {/* 上传操作区 */}
              {tableFile ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2.5 truncate">
                      <FileSpreadsheet className="w-5 h-5 text-blue-600 shrink-0" />
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-800 truncate">{tableFile.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {tableResult?.activeSheetName} · {products.length} 款
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowMappingPanel(!showMappingPanel)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors flex items-center gap-1 ${
                          showMappingPanel
                            ? 'bg-blue-50 text-blue-700 border-blue-300'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                        title="查看与调整列映射"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>列映射</span>
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
                </div>
              ) : (
                <div
                  onClick={() => tableInputRef.current?.click()}
                  className="cursor-pointer rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition-colors hover:border-blue-500 hover:bg-blue-50/40"
                >
                  <Upload className="mx-auto mb-1.5 h-5 w-5 text-slate-500" />
                  <p className="text-xs font-medium text-slate-800">选择商品表格</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">XLSX、XLS 或 CSV</p>
                </div>
              )}
            </div>

            {/* 映射状态提示 */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span>标题翻译</span>
              </span>
              {products.length > 0 && (
                <button
                  type="button"
                  onClick={() => autoTranslateTitles(products)}
                  disabled={isTranslatingAll}
                  className="text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isTranslatingAll ? 'animate-spin' : ''}`} />
                  <span>{isTranslatingAll ? '翻译中...' : '重新翻译'}</span>
                </button>
              )}
            </div>
            {products.length > 0 && (
              <div className="mt-3 space-y-1.5" role="status" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-slate-700">
                    {isTranslatingAll && <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />}
                    {isTranslatingAll ? '标题翻译中' : translationProgress?.failed ? '部分标题未翻译' : '标题翻译'}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-700">
                    {isTranslatingAll
                      ? `${translationProgress?.done || 0} / ${translationProgress?.total || 0}`
                      : `${translatedCount} / ${products.length}`}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="标题翻译进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={
                  isTranslatingAll && translationProgress?.total
                    ? Math.round((translationProgress.done / translationProgress.total) * 100)
                    : 100
                }>
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${translationProgress?.failed ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{
                      width: `${isTranslatingAll && translationProgress?.total
                        ? Math.round((translationProgress.done / translationProgress.total) * 100)
                        : 100}%`,
                    }}
                  />
                </div>
                {translationProgress?.failed ? (
                  <p className="text-[11px] text-amber-800">{translationProgress.failed} 款失败，可点“重新翻译”重试</p>
                ) : null}
              </div>
            )}
          </div>

          {/* 模块 2：上架模板配置 */}
          <div className="workspace-panel flex flex-col justify-between p-4 text-left">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">上架目标模板</h2>
                </div>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {templateFile ? '自定义底表' : '系统内置标准模板'}
                </span>
              </div>

              {/* 模板操作区 */}
              {templateFile ? (
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 truncate">
                    <FileSpreadsheet className="w-5 h-5 text-purple-600 shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-bold text-slate-800 truncate">{templateFile.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {templateSavedAt
                          ? `系统已保存 · ${new Date(templateSavedAt).toLocaleString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })} 保存`
                          : '已载入系统底表'}
                      </p>
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
                      <p className="text-xs font-medium text-slate-800">使用系统标准模板</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => templateInputRef.current?.click()}
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    上传自定义底表
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* 列映射抽屉/配置面板 */}
        {showMappingPanel && tableResult && (
          <div className="workspace-panel border-blue-200 p-5 text-left animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">上传表格列映射配置</h3>
                <span className="text-xs text-slate-500">
                  （如自动识别有误，请在下方下拉选择对应列）
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowMappingPanel(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {/* 标题列 */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">
                  商品标题列 (C列)
                </label>
                <select
                  value={columnOverrides.titleColIndex ?? -1}
                  onChange={(e) => handleUpdateColumnMapping('titleColIndex', Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white outline-none focus:border-blue-500"
                >
                  {tableResult.columns.map((c) => (
                    <option key={c.index} value={c.index}>
                      [{c.letter}] {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 衣服图片直链列 */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">
                  衣服图片直链列 (FV列)
                </label>
                <select
                  value={columnOverrides.imageColIndex ?? -1}
                  onChange={(e) => handleUpdateColumnMapping('imageColIndex', Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white outline-none focus:border-blue-500"
                >
                  {tableResult.columns.map((c) => (
                    <option key={c.index} value={c.index}>
                      [{c.letter}] {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 原表格颜色列 */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">
                  原表格颜色列 (回填目标)
                </label>
                <select
                  value={columnOverrides.colorColIndex ?? -1}
                  onChange={(e) => handleUpdateColumnMapping('colorColIndex', Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white outline-none focus:border-blue-500"
                >
                  <option value={-1}>自动检测或追加“颜色”列</option>
                  {tableResult.columns.map((c) => (
                    <option key={c.index} value={c.index}>
                      [{c.letter}] {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 英文标题列 */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700">
                  英文标题列 (D列)
                </label>
                <select
                  value={columnOverrides.englishTitleColIndex ?? -1}
                  onChange={(e) => handleUpdateColumnMapping('englishTitleColIndex', Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white outline-none focus:border-blue-500"
                >
                  <option value={-1}>未指定 (自动调用谷歌翻译)</option>
                  {tableResult.columns.map((c) => (
                    <option key={c.index} value={c.index}>
                      [{c.letter}] {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 模块 3：人工判定衣服黑白颜色与多方式导出 */}
        <div className="workspace-panel space-y-3 p-4 text-left">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-slate-900">商品</h2>
              {products.length > 0 && <span className="text-xs text-slate-500">{filteredProducts.length} / {products.length}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* 一键导出整合上架模板 */}
              <button
                type="button"
                onClick={handleExportCombined}
                disabled={products.length === 0 || isBatchExporting}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download className={`h-3.5 w-3.5 ${isBatchExporting ? 'animate-bounce' : ''}`} />
                <span>{isBatchExporting ? '正在生成...' : '导出上架模板'}</span>
              </button>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">其他导出</summary>
                <div className="absolute right-0 top-full z-20 mt-1 flex min-w-48 flex-col gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-lg">
                  <button type="button" onClick={handleExportBackToOriginalTable} disabled={products.length === 0 || isExportingOriginal} className="rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                    {isExportingOriginal ? '正在回填导出...' : '回填原表格并下载'}
                  </button>
                  <button type="button" onClick={handleExportMappingExcel} disabled={products.length === 0} className="rounded px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-40">
                    导出颜色与图片对照表
                  </button>
                </div>
              </details>
            </div>
          </div>

          {/* 实时状态统计、筛选与视图切换 */}
          {products.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* 颜色筛选器 */}
                <div className="flex items-center gap-1 bg-white p-0.5 border border-slate-200 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setColorFilter('all')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                      colorFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    全部 ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorFilter('black')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                      colorFilter === 'black' ? 'bg-zinc-950 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-zinc-950 border border-zinc-400"></span>
                    <span>黑色衣服 ({blackCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorFilter('white')}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                      colorFilter === 'white' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-white border border-slate-300"></span>
                    <span>白色衣服 ({whiteCount})</span>
                  </button>
                </div>

                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="text-slate-500 text-xs hidden sm:inline">
                  标题已翻译: <strong className="text-slate-800">{translatedCount}</strong>/{products.length}
                </span>
              </div>

              {/* 视图切换：画廊看图 vs 表格紧凑 */}
              <div className="flex items-center gap-1 bg-white p-0.5 border border-slate-200 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setViewLayout('card')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    viewLayout === 'card'
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  图片
                </button>
                <button
                  type="button"
                  onClick={() => setViewLayout('table')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    viewLayout === 'table'
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  列表
                </button>
              </div>
            </div>
          )}

          {/* 商品列表与人工选择展示 */}
          {products.length > 0 ? (
            viewLayout === 'card' ? (
              /* 画廊大图看图模式：突出展示衣服图片，并提供极为醒目的黑白二选一按钮 */
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map((item, idx) => {
                  const isEditing = editingId === item.id;
                  const isBlack = item.selectedColor === 'black';
                  const isWhite = item.selectedColor === 'white';
                  const rowStep = 6;
                  const originalIndex = products.findIndex((p) => p.id === item.id);
                  const startRow = 6 + originalIndex * rowStep;
                  const endRow = startRow + 5;
                  const rowRangeLabel = `第 ${startRow}~${endRow} 行`;

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col justify-between gap-2.5 rounded-lg border bg-white p-3 text-left ${
                        isBlack
                          ? 'border-slate-300'
                          : 'border-sky-300'
                      }`}
                    >
                      {/* 卡片头部：序号、标题与行号 */}
                      <div className="min-w-0 space-y-1 border-b border-slate-100 pb-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-slate-400">#{originalIndex + 1}</span>
                          <span className="text-[10px] text-slate-400">{rowRangeLabel}</span>
                        </div>

                        {/* 标题可编辑 */}
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 pt-1">
                            <input
                              type="text"
                              maxLength={250}
                              value={editTitleText}
                              onChange={(e) => setEditTitleText(e.target.value)}
                              className="w-full text-xs font-bold p-1 border border-blue-400 rounded bg-white outline-none"
                              autoFocus
                            />
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
                            className="group flex items-center justify-between gap-1.5 cursor-pointer pt-0.5"
                            title="点击修改商品标题"
                          >
                            <span className="text-xs font-bold text-slate-900 line-clamp-1 group-hover:text-blue-600">
                              {item.title}
                            </span>
                            <Edit2 className="w-3 h-3 text-slate-300 group-hover:text-blue-500 shrink-0" />
                          </div>
                        )}

                        {/* 英文标题 */}
                        {item.englishTitle && (
                          <p className="text-[10px] text-slate-500 truncate italic flex items-center gap-1">
                            <Globe className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                            <span>D{startRow}: {item.englishTitle}</span>
                          </p>
                        )}
                      </div>

                      {/* 衣服照片大图展示区 */}
                      <div className="relative">
                        <div
                          onClick={() => openImagePreview(item)}
                          className="w-full aspect-[3/4] overflow-hidden rounded-md bg-slate-100 relative group cursor-pointer flex items-center justify-center"
                        >
                          {item.imageUrl ? (
                            <>
                              <img
                                src={item.imageUrl}
                                alt="衣服图片"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 text-xs font-medium">
                                <Maximize2 className="w-4 h-4 drop-shadow" />
                                <span>点击放大查看衣服细节</span>
                              </div>
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-4 text-center text-slate-400">
                              <ImageIcon className="w-8 h-8 mb-1 stroke-1 text-slate-300" />
                              <span className="text-xs">暂无图片链接</span>
                            </div>
                          )}

                        </div>

                        {/* 修改链接工具按钮 */}
                        <div className="mt-1 flex items-center justify-end px-1">
                          <button
                            type="button"
                            onClick={() => setEditingUrlItem({ id: item.id, url: item.imageUrl || '' })}
                            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-700"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>修改图片链接</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1" aria-label="选择衣服颜色">
                          <button
                            type="button"
                            onClick={() => handleSetItemColor(item.id, 'black')}
                            aria-pressed={isBlack}
                            className={`flex-1 rounded px-2 py-2 text-xs font-semibold transition-colors ${
                              isBlack ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'
                            }`}
                          >
                            黑色
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetItemColor(item.id, 'white')}
                            aria-pressed={isWhite}
                            className={`flex-1 rounded px-2 py-2 text-xs font-semibold transition-colors ${
                              isWhite ? 'bg-sky-700 text-white' : 'text-slate-600 hover:bg-white'
                            }`}
                          >
                            白色
                          </button>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const info = `商品: ${item.title}\n判定衣服颜色: ${isBlack ? '黑色' : '白色'}\nEE列颜色填入值: ${isBlack ? '黑色' : '白色'}\nFV列图片直链: ${item.imageUrl}\n所在行: ${rowRangeLabel}`;
                            safeCopy(info, item.id);
                          }}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          title="复制该商品映射信息"
                          aria-label="复制商品映射信息"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleExportSingle(item, originalIndex)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          title="导出此款单品上架模板"
                          aria-label={`导出第 ${originalIndex + 1} 款`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>导出单款</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* 表格列表视图：紧凑列出全部商品，行内直接切换黑白 */
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="bg-slate-50 p-3 flex items-center justify-between text-xs font-bold text-slate-600 border-b border-slate-200">
                  <div className="flex items-center gap-4">
                    <span className="w-12 text-center">序号</span>
                    <span className="w-14 text-center">图片</span>
                    <span>商品信息 (标题/英文)</span>
                  </div>
                  <div className="flex items-center gap-8 mr-4">
                    <span>人为选择衣服颜色 (填入表格)</span>
                    <span className="hidden sm:inline">表格回填结果</span>
                    <span>操作</span>
                  </div>
                </div>

                {filteredProducts.map((item) => {
                  const originalIndex = products.findIndex((p) => p.id === item.id);
                  const isEditing = editingId === item.id;
                  const isBlack = item.selectedColor === 'black';
                  const rowStep = 6;
                  const startRow = 6 + originalIndex * rowStep;
                  const endRow = startRow + 5;
                  const rowRangeLabel = `第 ${startRow}~${endRow} 行`;

                  return (
                    <div
                      key={item.id}
                      className="p-3 sm:p-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors text-left"
                    >
                      {/* 左侧：序号、图片与标题 */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex flex-col items-center gap-0.5 shrink-0 w-12 text-center">
                          <span className="text-xs font-mono font-bold text-slate-500">#{originalIndex + 1}</span>
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                            R{startRow}-{endRow}
                          </span>
                        </div>

                        {/* 衣服图片缩略图 */}
                        <div
                          onClick={() => openImagePreview(item)}
                          className="w-12 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden relative group cursor-pointer shrink-0 shadow-2xs hover:border-blue-400"
                          title="点击放大查看衣服图片"
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt="衣服图"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-400">
                              无图
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Maximize2 className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        {/* 标题与英文翻译 */}
                        <div className="min-w-0 flex-1 space-y-1">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 max-w-md">
                              <input
                                type="text"
                                maxLength={250}
                                value={editTitleText}
                                onChange={(e) => setEditTitleText(e.target.value)}
                                className="w-full text-xs font-bold p-1 border border-blue-400 rounded bg-white outline-none"
                                autoFocus
                              />
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

                          {item.englishTitle && (
                            <div className="text-[11px] text-blue-600 truncate italic flex items-center gap-1 mt-1 font-mono bg-blue-50/50 p-1 rounded">
                              <Globe className="w-3 h-3 text-blue-500 shrink-0" />
                              <span>{item.englishTitle}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 中间与右侧：人为选择黑白按钮与回填提示 */}
                      <div className="flex flex-wrap items-center gap-4 shrink-0">
                        {/* 黑白选择切换器 */}
                        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-300 gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetItemColor(item.id, 'black')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              isBlack
                                ? 'bg-zinc-950 text-white shadow-xs ring-1 ring-emerald-400'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-zinc-950 border border-zinc-400"></span>
                            <span>黑色衣服</span>
                            {isBlack && <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSetItemColor(item.id, 'white')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              !isBlack
                                ? 'bg-blue-600 text-white shadow-xs ring-1 ring-emerald-400'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300"></span>
                            <span>白色衣服</span>
                            {!isBlack && <Check className="w-3 h-3 text-emerald-300 stroke-[3]" />}
                          </button>
                        </div>

                        {/* 回填预览 */}
                        <div className="hidden sm:flex flex-col text-[11px] font-mono text-slate-600">
                          <span className={`font-bold ${isBlack ? 'text-zinc-900' : 'text-blue-700'}`}>
                            EE列: 「{isBlack ? '黑色' : '白色'}」
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            FV列: 直链已就绪
                          </span>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleExportSingle(item, originalIndex)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                            title="导出此款单品上架模板"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="py-12 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400">
              <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
              <p className="text-xs font-medium">请先在第 1 步上传商品表格</p>
              <p className="text-[11px] text-slate-400 mt-0.5">上传后将自动提取衣服图片直链，并支持人工点击选择衣服为黑色或白色</p>
            </div>
          )}
        </div>
      </div>

      {/* 修改 URL 弹窗 Modal */}
      {editingUrlItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  修改衣服图片直链 URL
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUrlItem(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">图片直链 URL (HTTP/HTTPS):</label>
              <textarea
                value={editingUrlItem.url}
                onChange={(e) => setEditingUrlItem({ ...editingUrlItem, url: e.target.value })}
                rows={3}
                placeholder="https://..."
                className="w-full text-xs font-mono p-2 border border-slate-300 rounded-lg outline-none focus:border-blue-500"
              />
              {editingUrlItem.url && isHttpUrl(editingUrlItem.url) && (
                <div className="w-20 h-24 rounded border border-slate-200 overflow-hidden mx-auto mt-2">
                  <img
                    src={editingUrlItem.url}
                    alt="预览"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingUrlItem(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveUrlEdit}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 大图高精度预览 Modal */}
      {previewModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  衣
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 truncate">
                    {previewModal.title || '衣服图片高清细节查看'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    当前判定为: <strong>{previewModal.selectedColor === 'black' ? '黑色衣服' : '白色衣服'}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center bg-slate-100/60 min-h-[350px] gap-4">
              <div className="max-h-[60vh] aspect-[3/4] rounded-xl overflow-hidden border border-slate-300 shadow-xl bg-white flex items-center justify-center">
                {previewModal.originalUrl ? (
                  <img
                    src={previewModal.originalUrl}
                    alt="高清图片预览"
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-xs text-slate-400">暂无图片链接</span>
                )}
              </div>

              {previewModal.originalUrl && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => safeCopy(previewModal.originalUrl, 'modal_copy')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer border border-slate-300"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>复制直链</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadImageAs1340x1785(previewModal.originalUrl, `${previewModal.title}.jpg`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold cursor-pointer shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下载高清图</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 极速看图判定模式 Modal (Rapid Review Mode) */}
      {rapidReviewIndex !== null && products[rapidReviewIndex] && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[95vh] flex flex-col shadow-2xl overflow-hidden border border-zinc-700">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold border border-emerald-500/30">
                  进度: {rapidReviewIndex + 1} / {products.length}
                </span>
                <span className="text-xs text-slate-300">
                  键盘快捷键: <strong>[ 1 或 B ]</strong> 选黑色 · <strong>[ 2 或 W ]</strong> 选白色 · <strong>[ 方向键 ]</strong> 切换
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRapidReviewIndex(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            {(() => {
              const current = products[rapidReviewIndex];
              const isCurBlack = current.selectedColor === 'black';

              return (
                <div className="p-6 flex flex-col items-center justify-between gap-4 overflow-y-auto">
                  <div className="text-center space-y-1">
                    <h3 className="text-base font-bold text-slate-900 line-clamp-1">
                      {current.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      第 {current.rowIndex} 行 · 当前已判定为:
                      <strong className={`ml-1 ${isCurBlack ? 'text-zinc-950 font-bold' : 'text-blue-600 font-bold'}`}>
                        {isCurBlack ? '⚫ 黑色衣服' : '⚪ 白色衣服'}
                      </strong>
                    </p>
                  </div>

                  {/* 衣服大图 */}
                  <div className="max-h-[50vh] aspect-[3/4] rounded-2xl overflow-hidden border-2 border-slate-300 shadow-lg bg-slate-100 flex items-center justify-center relative">
                    {current.imageUrl ? (
                      <img
                        src={current.imageUrl}
                        alt="衣服审核"
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">暂无图片</span>
                    )}

                    {/* 当前选中的大徽章 */}
                    <div className="absolute top-3 right-3 shadow-md">
                      {isCurBlack ? (
                        <div className="px-3 py-1 rounded-full text-xs font-bold bg-zinc-950 text-white border border-zinc-700 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                          <span>已选: 黑色</span>
                        </div>
                      ) : (
                        <div className="px-3 py-1 rounded-full text-xs font-bold bg-white text-blue-800 border border-blue-300 flex items-center gap-1.5 shadow-sm">
                          <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3]" />
                          <span>已选: 白色</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 超大按键区 */}
                  <div className="w-full grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        handleSetItemColor(current.id, 'black', false);
                        if (rapidReviewIndex < products.length - 1) {
                          setRapidReviewIndex(rapidReviewIndex + 1);
                        }
                      }}
                      className={`py-3.5 px-4 rounded-2xl text-sm font-extrabold cursor-pointer transition-all flex items-center justify-center gap-2 border-2 ${
                        isCurBlack
                          ? 'bg-zinc-950 text-white border-zinc-900 ring-4 ring-emerald-400 shadow-lg'
                          : 'bg-white hover:bg-zinc-100 text-zinc-900 border-zinc-300'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-zinc-950 border border-zinc-400"></span>
                      <span>[按 1] 衣服是黑色</span>
                      {isCurBlack && <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleSetItemColor(current.id, 'white', false);
                        if (rapidReviewIndex < products.length - 1) {
                          setRapidReviewIndex(rapidReviewIndex + 1);
                        }
                      }}
                      className={`py-3.5 px-4 rounded-2xl text-sm font-extrabold cursor-pointer transition-all flex items-center justify-center gap-2 border-2 ${
                        !isCurBlack
                          ? 'bg-blue-600 text-white border-blue-600 ring-4 ring-emerald-400 shadow-lg'
                          : 'bg-white hover:bg-blue-50 text-blue-700 border-slate-300'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white border border-slate-300"></span>
                      <span>[按 2] 衣服是白色</span>
                      {!isCurBlack && <Check className="w-4 h-4 text-emerald-300 stroke-[3]" />}
                    </button>
                  </div>

                  {/* 翻页导航栏 */}
                  <div className="w-full flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <button
                      type="button"
                      onClick={() => setRapidReviewIndex(Math.max(0, rapidReviewIndex - 1))}
                      disabled={rapidReviewIndex === 0}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>上一件</span>
                    </button>

                    <span className="text-slate-400 text-[11px]">
                      已判定: 黑色 {blackCount} 款 · 白色 {whiteCount} 款
                    </span>

                    <button
                      type="button"
                      onClick={() => setRapidReviewIndex(Math.min(products.length - 1, rapidReviewIndex + 1))}
                      disabled={rapidReviewIndex === products.length - 1}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                    >
                      <span>下一件</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

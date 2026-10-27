import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Check,
  RotateCcw,
  Sliders,
  Layers,
  FileSpreadsheet,
  Plus,
  Trash2,
  HelpCircle,
  Eye,
  Download,
  Upload,
  Sparkles,
  Table,
  CheckCircle2,
  Info,
} from 'lucide-react';
import {
  TemplateMappingConfig,
  SpuAttributeRule,
  SkuSizeItem,
  TemplateSheetHeaderInfo,
} from './types';
import {
  DEFAULT_TEMPLATE_CONFIG,
  DEFAULT_COLUMN_MAPPING,
  DEFAULT_SPU_RULES,
  DEFAULT_SIZE_MATRIX,
  saveTemplateConfig,
  resetTemplateConfigToDefault,
  buildMultiProductTemplateRules,
} from './rules';

interface TemplateMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: TemplateMappingConfig;
  onSaveConfig: (newConfig: TemplateMappingConfig) => void;
  sheetHeaders?: TemplateSheetHeaderInfo[];
  availableSheets?: { index: number; name: string }[];
  sampleProductTitle?: string;
  sampleWhiteUrl?: string;
  sampleBlackUrl?: string;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const TemplateMappingModal: React.FC<TemplateMappingModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  sheetHeaders = [],
  availableSheets = [],
  sampleProductTitle = '2026跨境爆款圆领短袖T恤',
  sampleWhiteUrl = 'https://example.com/hosted/white_1340x1785.jpg',
  sampleBlackUrl = 'https://example.com/hosted/black_1340x1785.jpg',
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'columns' | 'spu' | 'sku' | 'preview'>('columns');
  const [draftConfig, setDraftConfig] = useState<TemplateMappingConfig>(config);

  // New SPU Rule input state
  const [newSpuCol, setNewSpuCol] = useState('');
  const [newSpuVal, setNewSpuVal] = useState('');
  const [newSpuCat, setNewSpuCat] = useState('');

  // SPU search filter
  const [spuFilter, setSpuFilter] = useState('');

  // Selected sheet for header inspection
  const [inspectSheetIdx, setInspectSheetIdx] = useState<number>(0);

  useEffect(() => {
    if (isOpen) {
      setDraftConfig(JSON.parse(JSON.stringify(config)));
      setActiveTab('columns');
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  // Header options of current inspected sheet
  const currentSheetHeaders = sheetHeaders.find((s) => s.sheetIndex === inspectSheetIdx)?.headers || [];

  // Update a column value in draftConfig
  const updateColumn = (key: keyof typeof DEFAULT_COLUMN_MAPPING, value: any) => {
    setDraftConfig((prev) => ({
      ...prev,
      columns: {
        ...prev.columns,
        [key]: typeof value === 'string' ? value.toUpperCase().trim() : value,
      },
    }));
  };

  // Toggle SPU rule enabled
  const toggleSpuRule = (id: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      spuRules: prev.spuRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    }));
  };

  // Update SPU rule field
  const updateSpuRule = (id: string, field: 'column' | 'value' | 'category', val: any) => {
    setDraftConfig((prev) => ({
      ...prev,
      spuRules: prev.spuRules.map((r) => {
        if (r.id !== id) return r;
        return {
          ...r,
          [field]: field === 'column' ? String(val).toUpperCase().trim() : val,
        };
      }),
    }));
  };

  // Delete SPU rule
  const deleteSpuRule = (id: string) => {
    setDraftConfig((prev) => ({
      ...prev,
      spuRules: prev.spuRules.filter((r) => r.id !== id),
    }));
  };

  // Add new SPU rule
  const handleAddSpuRule = () => {
    if (!newSpuCol.trim()) {
      onShowToast('请输入列字母（如 E, AB, CS）', 'error');
      return;
    }
    const newRule: SpuAttributeRule = {
      id: `custom_${crypto.randomUUID()}`,
      column: newSpuCol.toUpperCase().trim(),
      value: newSpuVal,
      category: newSpuCat.trim() || '自定义属性',
      enabled: true,
    };
    setDraftConfig((prev) => ({
      ...prev,
      spuRules: [...prev.spuRules, newRule],
    }));
    setNewSpuCol('');
    setNewSpuVal('');
    setNewSpuCat('');
    onShowToast(`已添加 ${newRule.column} 列 SPU 写入规则`, 'success');
  };

  // Update SKU size item
  const updateSizeItem = (index: number, field: keyof SkuSizeItem, val: any) => {
    setDraftConfig((prev) => {
      const nextMatrix = [...prev.sizeMatrix];
      nextMatrix[index] = {
        ...nextMatrix[index],
        [field]: typeof val === 'string' && !isNaN(Number(val)) && field !== 'size' ? Number(val) : val,
      };
      return { ...prev, sizeMatrix: nextMatrix };
    });
  };

  // Add new size item
  const handleAddSizeItem = () => {
    const defaultSizeNames = ['0XL', '1XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL'];
    const currentCount = draftConfig.sizeMatrix.length;
    const nextName = defaultSizeNames[currentCount] || `SIZE_${currentCount + 1}`;
    const newItem: SkuSizeItem = {
      size: nextName,
      co: 55,
      cp: 140,
      cq: 84,
      cr: 26,
      price: draftConfig.columns.defaultPrice,
      pkgWeight: draftConfig.columns.defaultPkgWeight,
    };
    setDraftConfig((prev) => ({
      ...prev,
      sizeMatrix: [...prev.sizeMatrix, newItem],
    }));
    onShowToast(`已新增 ${newItem.size} 尺码规则`, 'success');
  };

  // Delete size item
  const handleDeleteSizeItem = (index: number) => {
    if (draftConfig.sizeMatrix.length <= 1) {
      onShowToast('至少需保留 1 个尺码规格', 'error');
      return;
    }
    setDraftConfig((prev) => ({
      ...prev,
      sizeMatrix: prev.sizeMatrix.filter((_, i) => i !== index),
    }));
  };

  // Reset to default
  const handleReset = () => {
    if (window.confirm('确定要重置所有写入位置与规则为系统默认标准吗？')) {
      const def = resetTemplateConfigToDefault();
      setDraftConfig(JSON.parse(JSON.stringify(def)));
      onShowToast('已重置为系统默认写入规则', 'info');
    }
  };

  // Export config as JSON
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(draftConfig, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `模板写入位置配置_${draftConfig.presetName || '自定义'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast('已导出配置文件 JSON', 'success');
  };

  // Import config from JSON
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.columns && Array.isArray(parsed.spuRules)) {
          setDraftConfig(parsed);
          onShowToast('已成功导入配置文件！', 'success');
        } else {
          onShowToast('配置文件格式不符合规范', 'error');
        }
      } catch (err: any) {
        onShowToast('解析 JSON 配置文件失败', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Save changes
  const handleSave = () => {
    saveTemplateConfig(draftConfig);
    onSaveConfig(draftConfig);
    onShowToast('已成功保存模板数据写入位置与规则！', 'success');
    onClose();
  };

  // Live simulation rules for 2 sample products
  const previewRules = useMemo(() => {
    return buildMultiProductTemplateRules(
      [
        {
          title: sampleProductTitle,
          whiteImageUrl: sampleWhiteUrl,
          blackImageUrl: sampleBlackUrl,
        },
        {
          title: `${sampleProductTitle} (第二款)`,
          whiteImageUrl: sampleWhiteUrl,
          blackImageUrl: sampleBlackUrl,
        },
      ],
      draftConfig
    );
  }, [sampleProductTitle, sampleWhiteUrl, sampleBlackUrl, draftConfig]);

  const filteredSpuRules = useMemo(() => {
    if (!spuFilter.trim()) return draftConfig.spuRules;
    const q = spuFilter.toLowerCase();
    return draftConfig.spuRules.filter(
      (r) =>
        r.column.toLowerCase().includes(q) ||
        String(r.value).toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }, [draftConfig.spuRules, spuFilter]);

  const rowsPerProduct = 1 + draftConfig.whiteSkuCount + draftConfig.blackSkuCount;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-left">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">模板数据写入位置与规则设置</h3>
                <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">
                  支持自定义底表映射
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                根据您导入的 Excel 模板结构，灵活调整各字段（标题、白图、黑图、SPU/SKU规格等）的写入行与列坐标
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 pt-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('columns')}
              className={`px-3.5 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'columns'
                  ? 'border-purple-600 text-purple-700 bg-purple-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>1. 核心行与列位置映射</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('spu')}
              className={`px-3.5 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'spu'
                  ? 'border-purple-600 text-purple-700 bg-purple-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>2. SPU 属性规则 ({draftConfig.spuRules.filter((r) => r.enabled).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('sku')}
              className={`px-3.5 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'sku'
                  ? 'border-purple-600 text-purple-700 bg-purple-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>3. SKU 尺码与测量矩阵 ({draftConfig.sizeMatrix.length}码)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3.5 py-2 text-xs font-bold border-b-2 flex items-center gap-1.5 cursor-pointer transition-colors ${
                activeTab === 'preview'
                  ? 'border-purple-600 text-purple-700 bg-purple-50/50 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-t-lg'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>4. 写入效果实时预览 ({previewRules.length}项)</span>
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <span className="text-xs text-slate-500">
              每款商品占 <strong>{rowsPerProduct}</strong> 行 (SPU 1行 + SKU {draftConfig.whiteSkuCount + draftConfig.blackSkuCount}行)
            </span>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="p-5 flex-1 overflow-y-auto space-y-6 bg-slate-50/50">
          {/* TAB 1: 核心行与列映射 */}
          {activeTab === 'columns' && (
            <div className="space-y-5">
              {/* Sheet & Row Index Settings */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>目标工作表与行号设置</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      目标写入工作表
                    </label>
                    <select
                      value={draftConfig.targetSheetIndex}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          targetSheetIndex: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full p-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 text-xs focus:border-purple-500 outline-none"
                    >
                      <option value={-1}>自动选择 (若有则默认第 2 个工作表)</option>
                      {availableSheets.map((s) => (
                        <option key={s.index} value={s.index}>
                          工作表 {s.index + 1}: {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      SPU 起始行号 (第1款商品)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-mono">Row</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={draftConfig.spuStartRow}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            spuStartRow: Math.max(1, parseInt(e.target.value, 10) || 1),
                          }))
                        }
                        className="w-full p-2 rounded-lg border border-slate-300 bg-white font-mono font-bold text-slate-800 text-xs focus:border-purple-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      单款 SKU 数量配置
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                        <span className="text-[11px] text-slate-500">白款:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={draftConfig.whiteSkuCount}
                          onChange={(e) =>
                            setDraftConfig((prev) => ({
                              ...prev,
                              whiteSkuCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                            }))
                          }
                          className="w-10 text-center font-bold text-slate-800 text-xs bg-white border border-slate-200 rounded p-0.5 outline-none"
                        />
                        <span className="text-[10px] text-slate-400">行</span>
                      </div>
                      <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                        <span className="text-[11px] text-slate-500">黑款:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={draftConfig.blackSkuCount}
                          onChange={(e) =>
                            setDraftConfig((prev) => ({
                              ...prev,
                              blackSkuCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                            }))
                          }
                          className="w-10 text-center font-bold text-slate-800 text-xs bg-white border border-slate-200 rounded p-0.5 outline-none"
                        />
                        <span className="text-[10px] text-slate-400">行</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Imported Template Columns Reference Helper */}
              {currentSheetHeaders.length > 0 && (
                <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-900 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-purple-600" />
                      <span>检测到导入模板的表头参考 (点击列号可快速填入下方对应位置)：</span>
                    </span>
                    {availableSheets.length > 1 && (
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500">切换参考表：</span>
                        <select
                          value={inspectSheetIdx}
                          onChange={(e) => setInspectSheetIdx(parseInt(e.target.value, 10))}
                          className="bg-white text-[11px] border border-purple-200 rounded px-1.5 py-0.5 text-slate-700 outline-none"
                        >
                          {availableSheets.map((s) => (
                            <option key={s.index} value={s.index}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                    {currentSheetHeaders.map((h) => (
                      <span
                        key={h.column}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-purple-200 text-[11px] text-slate-700 shadow-2xs"
                        title={h.sampleValues?.join(', ') || h.headerName}
                      >
                        <span className="font-mono font-bold text-purple-700">{h.column}列</span>
                        <span className="text-slate-500 max-w-[120px] truncate">{h.headerName}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Core Field Column Mappings */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <h4 className="text-xs font-bold text-slate-800">
                  📌 核心字段写入列（支持填写任意 Excel 列字母，如 C, EA, CW, CJ...）
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
                  {/* 标题列 */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <label className="block font-bold text-slate-700 mb-1">
                      商品标题 (Title) 写入列
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-mono">列字母:</span>
                      <input
                        type="text"
                        value={draftConfig.columns.titleCol}
                        onChange={(e) => updateColumn('titleCol', e.target.value)}
                        className="w-16 p-1.5 text-center font-mono font-bold text-blue-700 bg-white border border-slate-300 rounded-md uppercase"
                        placeholder="C"
                      />
                      <span className="text-[11px] text-slate-500">SPU & SKU 对应行</span>
                    </div>
                  </div>

                  {/* 白色款图片列 */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <label className="block font-bold text-blue-700 mb-1">
                      白色款图片直链 (White URL) 列
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-mono">列字母:</span>
                      <input
                        type="text"
                        value={draftConfig.columns.whiteImageCol}
                        onChange={(e) => updateColumn('whiteImageCol', e.target.value)}
                        className="w-16 p-1.5 text-center font-mono font-bold text-blue-700 bg-white border border-slate-300 rounded-md uppercase"
                        placeholder="EA"
                      />
                      <span className="text-[11px] text-slate-500">白款 5 码对应行</span>
                    </div>
                  </div>

                  {/* 黑色款图片列 */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <label className="block font-bold text-purple-700 mb-1">
                      黑色款图片直链 (Black URL) 列
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-mono">列字母:</span>
                      <input
                        type="text"
                        value={draftConfig.columns.blackImageCol}
                        onChange={(e) => updateColumn('blackImageCol', e.target.value)}
                        className="w-16 p-1.5 text-center font-mono font-bold text-purple-700 bg-white border border-slate-300 rounded-md uppercase"
                        placeholder="EA"
                      />
                      <span className="text-[11px] text-slate-500">黑款 5 码对应行</span>
                    </div>
                  </div>

                  {/* SPU 行白图写入 */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-bold text-slate-700">SPU 首行图片链接写入</label>
                      <input
                        type="checkbox"
                        checked={draftConfig.columns.writeSpuImage}
                        onChange={(e) => updateColumn('writeSpuImage', e.target.checked)}
                        className="rounded text-purple-600"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-mono">列字母:</span>
                      <input
                        type="text"
                        disabled={!draftConfig.columns.writeSpuImage}
                        value={draftConfig.columns.spuImageCol}
                        onChange={(e) => updateColumn('spuImageCol', e.target.value)}
                        className="w-16 p-1.5 text-center font-mono font-bold text-slate-700 bg-white border border-slate-300 rounded-md uppercase disabled:opacity-50"
                        placeholder="EA"
                      />
                      <span className="text-[11px] text-slate-500">写入 SPU 主图</span>
                    </div>
                  </div>

                  {/* 颜色列 */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <label className="block font-bold text-slate-700 mb-1">
                      颜色属性 (Color) 列
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-mono">列字母:</span>
                      <input
                        type="text"
                        value={draftConfig.columns.colorCol}
                        onChange={(e) => updateColumn('colorCol', e.target.value)}
                        className="w-16 p-1.5 text-center font-mono font-bold text-slate-700 bg-white border border-slate-300 rounded-md uppercase"
                        placeholder="CC"
                      />
                      <span className="text-[11px] text-slate-500">填「白色」/「黑色」/「杏色」/「绿色」</span>
                    </div>
                  </div>

                  {/* 尺码列 */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <label className="block font-bold text-slate-700 mb-1">
                      尺码规格 (Size) 列
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 font-mono">列字母:</span>
                      <input
                        type="text"
                        value={draftConfig.columns.sizeNameCol}
                        onChange={(e) => updateColumn('sizeNameCol', e.target.value)}
                        className="w-16 p-1.5 text-center font-mono font-bold text-slate-700 bg-white border border-slate-300 rounded-md uppercase"
                        placeholder="CG"
                      />
                      <span className="text-[11px] text-slate-500">填 S, M, L, XL...</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced Columns (SKU Spec, Measurements, Warehouses, Packages) */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <h4 className="text-xs font-bold text-slate-800">
                  ⚙️ 尺码测量、价格、海外仓库存与包裹规格列设置
                </h4>

                {/* 4 Measurements */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-700 text-xs">尺码尺寸测量列 (CH~CK)</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 text-[11px]">肩宽列:</span>
                      <input
                        type="text"
                        value={draftConfig.columns.measureShoulderCol}
                        onChange={(e) => updateColumn('measureShoulderCol', e.target.value)}
                        className="w-full mt-0.5 p-1 text-center font-mono font-bold bg-white border border-slate-300 rounded uppercase"
                        placeholder="CH"
                      />
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px]">胸围列:</span>
                      <input
                        type="text"
                        value={draftConfig.columns.measureBustCol}
                        onChange={(e) => updateColumn('measureBustCol', e.target.value)}
                        className="w-full mt-0.5 p-1 text-center font-mono font-bold bg-white border border-slate-300 rounded uppercase"
                        placeholder="CI"
                      />
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px]">衣长列:</span>
                      <input
                        type="text"
                        value={draftConfig.columns.measureLengthCol}
                        onChange={(e) => updateColumn('measureLengthCol', e.target.value)}
                        className="w-full mt-0.5 p-1 text-center font-mono font-bold bg-white border border-slate-300 rounded uppercase"
                        placeholder="CJ"
                      />
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px]">袖长列:</span>
                      <input
                        type="text"
                        value={draftConfig.columns.measureSleeveCol}
                        onChange={(e) => updateColumn('measureSleeveCol', e.target.value)}
                        className="w-full mt-0.5 p-1 text-center font-mono font-bold bg-white border border-slate-300 rounded uppercase"
                        placeholder="CK"
                      />
                    </div>
                  </div>
                </div>

                {/* Price, Warehouses, Packages */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Price & Currency */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-700 text-xs">供货价格与币种</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 text-[11px]">价格列 (CW):</span>
                        <input
                          type="text"
                          value={draftConfig.columns.priceCol}
                          onChange={(e) => updateColumn('priceCol', e.target.value)}
                          className="w-full mt-0.5 p-1 text-center font-mono font-bold bg-white border border-slate-300 rounded uppercase"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">默认供货价:</span>
                        <input
                          type="number"
                          value={draftConfig.columns.defaultPrice}
                          onChange={(e) => updateColumn('defaultPrice', Number(e.target.value))}
                          className="w-full mt-0.5 p-1 text-center font-bold bg-white border border-slate-300 rounded"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Warehouses */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-700 text-xs">海外发货仓与库存列</span>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div>
                        <span className="text-slate-500">NJ仓/库存:</span>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={draftConfig.columns.warehouseNJCol}
                            onChange={(e) => updateColumn('warehouseNJCol', e.target.value)}
                            className="w-1/2 p-0.5 text-center font-mono bg-white border rounded uppercase"
                            title="仓名列"
                          />
                          <input
                            type="text"
                            value={draftConfig.columns.stockNJCol}
                            onChange={(e) => updateColumn('stockNJCol', e.target.value)}
                            className="w-1/2 p-0.5 text-center font-mono bg-white border rounded uppercase"
                            title="库存列"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">GA仓/库存:</span>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={draftConfig.columns.warehouseGACol}
                            onChange={(e) => updateColumn('warehouseGACol', e.target.value)}
                            className="w-1/2 p-0.5 text-center font-mono bg-white border rounded uppercase"
                            title="仓名列"
                          />
                          <input
                            type="text"
                            value={draftConfig.columns.stockGACol}
                            onChange={(e) => updateColumn('stockGACol', e.target.value)}
                            className="w-1/2 p-0.5 text-center font-mono bg-white border rounded uppercase"
                            title="库存列"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">FL仓/库存:</span>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={draftConfig.columns.warehouseFLCol}
                            onChange={(e) => updateColumn('warehouseFLCol', e.target.value)}
                            className="w-1/2 p-0.5 text-center font-mono bg-white border rounded uppercase"
                          />
                          <input
                            type="text"
                            value={draftConfig.columns.stockFLCol}
                            onChange={(e) => updateColumn('stockFLCol', e.target.value)}
                            className="w-1/2 p-0.5 text-center font-mono bg-white border rounded uppercase"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">CA仓/库存:</span>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={draftConfig.columns.warehouseCACol}
                            onChange={(e) => updateColumn('warehouseCACol', e.target.value)}
                            className="w-1/2 p-0.5 text-center font-mono bg-white border rounded uppercase"
                          />
                          <input
                            type="text"
                            value={draftConfig.columns.stockCACol}
                            onChange={(e) => updateColumn('stockCACol', e.target.value)}
                            className="w-1/2 p-0.5 text-center font-mono bg-white border rounded uppercase"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Packages */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                    <span className="font-bold text-slate-700 text-xs">包裹长宽高与重量列</span>
                    <div className="grid grid-cols-4 gap-1 text-[10px]">
                      <div>
                        <span className="text-slate-500">长(DW):</span>
                        <input
                          type="text"
                          value={draftConfig.columns.packageLengthCol}
                          onChange={(e) => updateColumn('packageLengthCol', e.target.value)}
                          className="w-full p-0.5 text-center font-mono bg-white border rounded uppercase"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500">宽(DX):</span>
                        <input
                          type="text"
                          value={draftConfig.columns.packageWidthCol}
                          onChange={(e) => updateColumn('packageWidthCol', e.target.value)}
                          className="w-full p-0.5 text-center font-mono bg-white border rounded uppercase"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500">高(DY):</span>
                        <input
                          type="text"
                          value={draftConfig.columns.packageHeightCol}
                          onChange={(e) => updateColumn('packageHeightCol', e.target.value)}
                          className="w-full p-0.5 text-center font-mono bg-white border rounded uppercase"
                        />
                      </div>
                      <div>
                        <span className="text-slate-500">重(DZ):</span>
                        <input
                          type="text"
                          value={draftConfig.columns.packageWeightCol}
                          onChange={(e) => updateColumn('packageWeightCol', e.target.value)}
                          className="w-full p-0.5 text-center font-mono bg-white border rounded uppercase"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SPU 属性写入规则 */}
          {activeTab === 'spu' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <span>SPU 行属性规则列表（写入第 {draftConfig.spuStartRow} 行及各商品 SPU 行）</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      您可以自由修改列名、写入固定值、分类，或添加/删除自定义字段
                    </p>
                  </div>

                  <input
                    type="text"
                    placeholder="搜索列/值/分类..."
                    value={spuFilter}
                    onChange={(e) => setSpuFilter(e.target.value)}
                    className="p-1.5 px-2.5 rounded-lg border border-slate-300 text-xs bg-slate-50 w-44 outline-none"
                  />
                </div>

                {/* SPU Rules Table */}
                <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2 px-3 w-12 text-center">启用</th>
                        <th className="py-2 px-3 w-20">列字母</th>
                        <th className="py-2 px-3">写入默认值</th>
                        <th className="py-2 px-3 w-32">字段分类</th>
                        <th className="py-2 px-2 w-12 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {filteredSpuRules.map((rule) => (
                        <tr key={rule.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-1.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={() => toggleSpuRule(rule.id)}
                              className="rounded text-purple-600 cursor-pointer"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              value={rule.column}
                              onChange={(e) => updateSpuRule(rule.id, 'column', e.target.value)}
                              className="w-16 p-1 text-center font-mono font-bold bg-white border border-slate-200 rounded uppercase text-xs text-blue-700"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              value={String(rule.value)}
                              onChange={(e) => updateSpuRule(rule.id, 'value', e.target.value)}
                              className="w-full p-1 bg-white border border-slate-200 rounded text-xs"
                            />
                          </td>
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              value={rule.category}
                              onChange={(e) => updateSpuRule(rule.id, 'category', e.target.value)}
                              className="w-full p-1 bg-white border border-slate-200 rounded text-xs text-slate-600"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => deleteSpuRule(rule.id)}
                              className="p-1 rounded text-slate-400 hover:text-red-600 cursor-pointer"
                              title="删除此规则"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add new SPU rule row */}
                <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-purple-900 text-xs">➕ 新增 SPU 字段：</span>
                  <input
                    type="text"
                    placeholder="列字母 (如 E)"
                    value={newSpuCol}
                    onChange={(e) => setNewSpuCol(e.target.value)}
                    className="w-20 p-1.5 text-center font-mono font-bold bg-white border border-purple-200 rounded uppercase"
                  />
                  <input
                    type="text"
                    placeholder="写入默认值 (如 纯棉)"
                    value={newSpuVal}
                    onChange={(e) => setNewSpuVal(e.target.value)}
                    className="flex-1 min-w-[140px] p-1.5 bg-white border border-purple-200 rounded"
                  />
                  <input
                    type="text"
                    placeholder="字段分类 (如 面料)"
                    value={newSpuCat}
                    onChange={(e) => setNewSpuCat(e.target.value)}
                    className="w-28 p-1.5 bg-white border border-purple-200 rounded"
                  />
                  <button
                    type="button"
                    onClick={handleAddSpuRule}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold cursor-pointer shadow-2xs"
                  >
                    添加规则
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SKU 尺码与测量规格矩阵 */}
          {activeTab === 'sku' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Table className="w-4 h-4 text-purple-600" />
                      <span>SKU 尺码与尺寸测量矩阵配置</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      白色款与黑色款各生成一套该尺码矩阵，每尺码占 1 行
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSizeItem}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加新尺码</span>
                  </button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2 px-3">尺码名称</th>
                        <th className="py-2 px-2 text-center">肩宽 ({draftConfig.columns.measureShoulderCol})</th>
                        <th className="py-2 px-2 text-center">胸围 ({draftConfig.columns.measureBustCol})</th>
                        <th className="py-2 px-2 text-center">衣长 ({draftConfig.columns.measureLengthCol})</th>
                        <th className="py-2 px-2 text-center">袖长 ({draftConfig.columns.measureSleeveCol})</th>
                        <th className="py-2 px-2 text-center">供货价 (¥)</th>
                        <th className="py-2 px-2 text-center">重量 (g)</th>
                        <th className="py-2 px-2 text-center w-12">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-mono">
                      {draftConfig.sizeMatrix.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3">
                            <input
                              type="text"
                              value={item.size}
                              onChange={(e) => updateSizeItem(idx, 'size', e.target.value)}
                              className="w-20 p-1 font-sans font-bold text-blue-700 bg-white border border-slate-200 rounded text-xs"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="number"
                              value={item.co}
                              onChange={(e) => updateSizeItem(idx, 'co', e.target.value)}
                              className="w-16 p-1 text-center bg-white border border-slate-200 rounded text-xs"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="number"
                              value={item.cp}
                              onChange={(e) => updateSizeItem(idx, 'cp', e.target.value)}
                              className="w-16 p-1 text-center bg-white border border-slate-200 rounded text-xs"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="number"
                              value={item.cq}
                              onChange={(e) => updateSizeItem(idx, 'cq', e.target.value)}
                              className="w-16 p-1 text-center bg-white border border-slate-200 rounded text-xs"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="number"
                              value={item.cr}
                              onChange={(e) => updateSizeItem(idx, 'cr', e.target.value)}
                              className="w-16 p-1 text-center bg-white border border-slate-200 rounded text-xs"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="number"
                              value={item.price ?? draftConfig.columns.defaultPrice}
                              onChange={(e) => updateSizeItem(idx, 'price', e.target.value)}
                              className="w-16 p-1 text-center bg-white border border-slate-200 rounded text-xs text-purple-700 font-bold"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <input
                              type="number"
                              value={item.pkgWeight ?? draftConfig.columns.defaultPkgWeight}
                              onChange={(e) => updateSizeItem(idx, 'pkgWeight', e.target.value)}
                              className="w-16 p-1 text-center bg-white border border-slate-200 rounded text-xs text-amber-800"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteSizeItem(idx)}
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                              title="删除此尺码"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 实时写入预览与验证 */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>单元格写入坐标实时推算预览 (前 2 款商品)</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      根据您当前设置的起始行号 ({draftConfig.spuStartRow}) 与列映射，导出时将在 Excel 对应位置写入以下内容
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                    共推算 {previewRules.length} 个单元格
                  </span>
                </div>

                <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold text-[11px]">
                      <tr>
                        <th className="py-2 px-3 w-24">目标单元格</th>
                        <th className="py-2 px-3 w-20">列</th>
                        <th className="py-2 px-3 w-36">属性说明</th>
                        <th className="py-2 px-3">写入内容 (示例)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {previewRules.slice(0, 40).map((r, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/50">
                          <td className="py-1.5 px-3 font-mono font-bold text-purple-700">
                            {r.cell}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-slate-500">
                            {r.column}
                          </td>
                          <td className="py-1.5 px-3 text-slate-600 text-[11px]">
                            {r.category}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-slate-900 truncate max-w-xs">
                            {String(r.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {previewRules.length > 40 && (
                  <p className="text-[11px] text-slate-400 text-center">
                    ... 已截取前 40 项预览，实际导出时将按此规律向下递增写入全部商品
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>恢复默认</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium cursor-pointer"
              title="导出当前配置为 JSON"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span>导出配置</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-slate-400" />
              <span>导入配置</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportJson}
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>保存并应用配置</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

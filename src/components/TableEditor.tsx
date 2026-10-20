import React, { useState, useMemo } from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle2, RefreshCw, ShieldCheck, Layers, Filter } from 'lucide-react';
import { modifyWorkbookPreservingStyles, StylePreservedResult, ROW6_RULES } from '../utils/stylePreservingExcel';

interface TableEditorProps {
  currentFile: File | null;
  result: StylePreservedResult | null;
  hasFile: boolean;
  onProcessed: (file: File, result: StylePreservedResult) => void;
  onExport: () => void;
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export const TableEditor: React.FC<TableEditorProps> = ({
  currentFile,
  result,
  hasFile,
  onProcessed,
  onExport,
  onShowToast,
  fileInputRef,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const set = new Set<string>();
    ROW6_RULES.forEach((r) => set.add(r.category));
    return ['all', ...Array.from(set)];
  }, []);

  const processFile = async (file: File, targetIdx?: number) => {
    try {
      setIsProcessing(true);
      const res = await modifyWorkbookPreservingStyles(file, targetIdx);
      onProcessed(file, res);
      onShowToast(res.message, 'success');
    } catch (err: any) {
      onShowToast(err.message || '文件导入修改失败，请检查文件格式', 'error');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleSwitchSheet = (idx: number) => {
    if (currentFile && idx !== result?.targetSheetIndex) {
      processFile(currentFile, idx);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const filteredModifications = useMemo(() => {
    if (!result) return [];
    if (selectedCategory === 'all') return result.modifications;
    return result.modifications.filter((m) => m.category === selectedCategory);
  }, [result, selectedCategory]);

  return (
    <div className="max-w-4xl mx-auto w-full py-6 px-4 flex flex-col items-center justify-center">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        id="main-file-input"
        accept=".xlsx, .xls, .csv"
        className="hidden"
        onChange={handleFileChange}
      />

      {!hasFile || !result ? (
        /* Empty State: Import Zone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full bg-white rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
            isDragging
              ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
              : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/60 shadow-xs'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 shadow-2xs">
            <Upload className="w-7 h-7" />
          </div>

          <h2 className="text-lg font-bold text-slate-900 mb-1">点击或拖拽导入表格文件</h2>
          <p className="text-xs sm:text-sm text-slate-500 mb-4 max-w-md">
            支持 Excel (.xlsx, .xls) 与 CSV 格式，自动识别第 2 个子表进行无损写入
          </p>

          {/* Current Rules Preview Grid */}
          <div className="w-full bg-slate-50 rounded-xl p-3.5 mb-4 border border-slate-200 text-left">
            <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
              <span>已配置写入字段（第 2 子表第 6 行共 {ROW6_RULES.length} 项）：</span>
              <span className="text-emerald-700 font-medium text-[11px]">100% 保护未改动单元格与原样式</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 font-mono text-xs max-h-56 overflow-y-auto pr-1">
              {ROW6_RULES.map((r) => (
                <div key={r.cell} className="bg-white border border-slate-200 px-2 py-1 rounded text-slate-700 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-blue-600 text-[11px]">{r.cell}</span>
                    <span className="text-[9px] text-slate-400">{r.category}</span>
                  </div>
                  <span className="truncate text-slate-800 text-[11px] mt-0.5 font-sans" title={String(r.value)}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium mb-4 border border-emerald-100">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>其余所有行、列、公式、字体边框与子表结构 100% 保持原状</span>
          </div>

          <button
            id="btn-upload-file"
            type="button"
            disabled={isProcessing}
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            <span>{isProcessing ? '正在处理中...' : '选择表格导入'}</span>
          </button>
        </div>
      ) : (
        /* Loaded State: Clean verification panel */
        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2.5">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 mb-1.5">
            已成功更新写入第 6 行共 {result.modifications.length} 项指定数据
          </span>

          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center justify-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <span>{result.fileName}</span>
          </h2>

          {/* Sheet Selector */}
          {result.allSheets.length > 1 && (
            <div className="w-full bg-slate-50 rounded-xl p-3 mb-3 border border-slate-200 text-left">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>工作簿识别到的子表（已默认选中第 2 个工作表）：</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.allSheets.map((s, idx) => {
                  const isCurrent = s.index === result.targetSheetIndex;
                  return (
                    <button
                      key={s.name + idx}
                      type="button"
                      onClick={() => handleSwitchSheet(s.index)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 border ${
                        isCurrent
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="opacity-80">表 {idx + 1}:</span>
                      <span className="font-semibold">{s.name}</span>
                      {isCurrent && (
                        <span className="bg-white/20 px-1 py-0.2 rounded text-[10px]">
                          当前目标
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Verification Box of Modded Cells */}
          <div className="w-full bg-slate-50 rounded-xl p-3.5 mb-4 border border-slate-200 text-left space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
              <span className="text-xs font-semibold text-slate-700">
                目标子表「<span className="text-blue-600 font-bold">{result.targetSheetName}</span>」第 6 行写入明细：
              </span>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-1 text-[11px] overflow-x-auto py-0.5">
                <Filter className="w-3 h-3 text-slate-400 mr-0.5 shrink-0" />
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {cat === 'all' ? `全部 (${result.modifications.length})` : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid of modification cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 text-left max-h-72 overflow-y-auto pr-1">
              {filteredModifications.map((mod) => (
                <div key={mod.cell} className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between shadow-2xs">
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-mono font-bold text-blue-600">
                        {mod.cell}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {mod.category}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block truncate" title={`原值: ${mod.originalValue}`}>
                      原: {mod.originalValue}
                    </span>
                  </div>
                  <div className="mt-2 pt-1 border-t border-slate-100">
                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs px-1.5 py-0.5 rounded block truncate" title={String(mod.value)}>
                      {mod.value}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>未涉及单元格及其他区域保持原样不变，原有表格字体、颜色与边框 100% 完整保留。</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 w-full max-w-sm justify-center">
            <button
              id="btn-reimport"
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors cursor-pointer shadow-2xs"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
              <span>更换表格</span>
            </button>

            <button
              id="btn-export-main"
              type="button"
              onClick={onExport}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>导出表格</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

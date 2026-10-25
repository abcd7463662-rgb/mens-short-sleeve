import React, { useState, useMemo, useRef } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Layers,
  Filter,
  Sparkles,
  Copy,
  Check,
  Table,
  LayoutGrid,
  User,
  Users,
} from 'lucide-react';
import { TemplateResult, TemplateGenderFormat } from './types';
import {
  TEMPLATE_RULES,
  TEMPLATE_ROW6_RULES_MEN,
  TEMPLATE_ROW6_RULES_WOMEN,
  TEMPLATE_PRICE_INVENTORY_RULES,
  TEMPLATE_PACKAGE_RULES,
  SIZE_CYCLE_MEN,
  SIZE_CYCLE_WOMEN,
  SKU_ROWS,
  buildMultiProductTemplateRules,
} from './rules';
import { executeTemplateGeneration, downloadTemplateFile } from './engine';

interface TemplateGeneratorViewProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

// 7~16 行 SKU 矩阵数据结构定义
interface SkuMatrixRow {
  rowNum: number;
  color: string;
  size: string;
  co: number; // 肩宽
  cp: number; // 胸围
  cq: number; // 衣长
  cr: number; // 袖长
  price: number;
  currency: string;
  njStock: number;
  gaStock: number;
  flStock: number;
  caStock: number;
  pkgL: number;
  pkgW: number;
  pkgH: number;
  pkgWeight: number;
}

export const TemplateGeneratorView: React.FC<TemplateGeneratorViewProps> = ({ onShowToast }) => {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [result, setResult] = useState<TemplateResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'matrix' | 'cards'>('matrix');
  const [genderFormat, setGenderFormat] = useState<TemplateGenderFormat>('women');
  const [hasCopied, setHasCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 动态根据性别格式计算 SKU 矩阵数据
  const matrixData: SkuMatrixRow[] = useMemo(() => {
    return SKU_ROWS.map((rowNum: number) => {
      const isBlack = rowNum >= 13;
      let cycleItem: { size: string; co: number; cp: number; cq: number; cr: number };
      
      if (genderFormat === 'mixed_men_women') {
        cycleItem = isBlack
          ? SIZE_CYCLE_WOMEN[(rowNum - 13) % SIZE_CYCLE_WOMEN.length]
          : SIZE_CYCLE_MEN[(rowNum - 7) % SIZE_CYCLE_MEN.length];
      } else if (genderFormat === 'women') {
        cycleItem = SIZE_CYCLE_WOMEN[(rowNum - 7) % SIZE_CYCLE_WOMEN.length];
      } else {
        cycleItem = SIZE_CYCLE_MEN[(rowNum - 7) % SIZE_CYCLE_MEN.length];
      }

      const color = isBlack ? '黑色' : '白色';
      return {
        rowNum,
        color,
        size: cycleItem.size,
        co: cycleItem.co,
        cp: cycleItem.cp,
        cq: cycleItem.cq,
        cr: cycleItem.cr,
        price: 45,
        currency: 'CNY',
        njStock: 9999,
        gaStock: 9999,
        flStock: 9999,
        caStock: 9999,
        pkgL: 35,
        pkgW: 21,
        pkgH: 1,
        pkgWeight: 180,
      };
    });
  }, [genderFormat]);

  const genderFormatLabel = useMemo(() => {
    if (genderFormat === 'women') return '女款';
    if (genderFormat === 'men') return '男款';
    return '前男后女复合款';
  }, [genderFormat]);

  const activeRules = useMemo(() => {
    return buildMultiProductTemplateRules(
      [
        {
          title: '示例商品',
          whiteImageUrl: 'https://example.com/white.jpg',
          blackImageUrl: 'https://example.com/black.jpg',
        },
      ],
      genderFormat
    );
  }, [genderFormat]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    activeRules.forEach((r) => set.add(r.category));
    return ['all', ...Array.from(set)];
  }, [activeRules]);

  // Format 7~16 rows matrix data into clean TSV / Markdown for clipboard copy
  const handleCopyMatrix = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const header =
        '行号\t颜色(CB)\t尺码(CF)\t肩宽(CG)\t胸围(CH)\t衣长(CI)\t袖长(CJ)\t供货价(CO)\t币种(CP)\tNJ仓(CQ/CR)\tGA仓(CS/CT)\tFL仓(CU/CV)\tCA仓(CW/CX)\t长宽高(DO~DQ)\t重量(DR)';
      const rows = matrixData
        .map(
          (r) =>
            `Row ${r.rowNum}\t${r.color}\t${r.size}\t${r.co}\t${r.cp}\t${r.cq}\t${r.cr}\t${r.price}\t${r.currency}\tNJ发货仓:9999\tGA发货仓:9999\tFL发货仓:9999\tCA发货仓:9999\t${r.pkgL}*${r.pkgW}*${r.pkgH}\t${r.pkgWeight}g`
        )
        .join('\n');

      navigator.clipboard.writeText(`${header}\n${rows}`);
      setHasCopied(true);
      onShowToast(
        `已成功复制 ${genderFormatLabel} 7~16 行完整 SKU 矩阵数据到剪贴板！`,
        'success'
      );
      setTimeout(() => setHasCopied(false), 2500);
    } catch {
      onShowToast('复制失败，请手动选择复制', 'error');
    }
  };

  const handleProcessFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      onShowToast('仅支持处理 .xlsx 或 .xls 格式的 Excel 表格文件', 'error');
      return;
    }

    setIsProcessing(true);
    setCurrentFile(file);

    try {
      const res = await executeTemplateGeneration(file, undefined, activeRules);
      setResult(res);
      onShowToast(
        `模板数据安全生成成功！已按【${genderFormatLabel}】格式写入第 2 个工作表「${res.targetSheetName}」`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err.message || '生成模板写入失败，请检查文件格式', 'error');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleProcessFile(files[0]);
    }
  };

  const handleExport = () => {
    if (!result) return;
    downloadTemplateFile(
      result.outputBlob,
      `生成模板_${genderFormatLabel}_${result.fileName}`
    );
    onShowToast('已启动导出文件下载', 'success');
  };

  const filteredModifications = useMemo(() => {
    if (!result) return [];
    if (selectedCategory === 'all') return result.modifications;
    return result.modifications.filter((m) => m.category === selectedCategory);
  }, [result, selectedCategory]);

  return (
    <div className="womens-workspace w-full max-w-7xl mx-auto py-6 px-4 sm:px-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleProcessFile(file);
        }}
      />

      {/* Header Info */}
      <div className="mb-5 space-y-3 border-b border-blue-100 pb-4">
        <h2 className="text-sm font-semibold text-slate-900">规格模板设置</h2>
        <p className="text-xs text-slate-500">选择模板格式，生成对应的 SPU 和 SKU 规格数据。</p>

        {/* 女款 / 男款 / 前男后女复合 格式切换栏 */}
        <div className="pt-1 flex justify-start">
          <div className="inline-flex flex-wrap items-center justify-start bg-blue-50 p-1 rounded-md border border-blue-100 gap-1">
            <button
              type="button"
              onClick={() => {
                setGenderFormat('women');
                onShowToast('已切换为【女款】模板格式（S~XXL: 肩宽38~46, 胸围86~110, 衣长64~72）', 'info');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                genderFormat === 'women'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>👗 女款模板 (女士合身)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGenderFormat('men');
                onShowToast('已切换为【男款】模板格式（S~XXL: 肩宽43~53, 胸围92~132, 衣长71~82）', 'info');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                genderFormat === 'men'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>👔 男款模板 (男士常规)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGenderFormat('mixed_men_women');
                onShowToast('已切换为【前男后女复合格式】（前段白色款男士常规 · 后段黑色款女士合身）', 'info');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                genderFormat === 'mixed_men_women'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>👫 前男后女复合 (白款男+黑款女)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Upload Dropzone */}
      {!result && (
        <div
          id="template-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-blue-500 bg-blue-50/50 scale-[1.01]'
              : 'border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50/50 shadow-sm'
          }`}
        >
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
              <Upload className="w-7 h-7 stroke-[1.75]" />
            </div>
            <div>
              <p className="text-base font-semibold text-slate-800">
                点击上传 或 拖拽底表文件到此处
              </p>
              <p className="text-xs text-slate-400 mt-1">
                支持标准 Excel (.xlsx / .xls) 文件 · 当前已选择：
                <strong className="text-purple-600 ml-1">
                  {genderFormat === 'women' ? '👗 女款规格' : '👔 男款规格'}
                </strong>
              </p>
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>智能写入第 2 个工作表，100% 保护原有公式与样式</span>
            </div>
          </div>
        </div>
      )}

      {/* Processing State */}
      {isProcessing && (
        <div className="py-12 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">
            正在安全解析工作簿并注入 {genderFormat === 'women' ? '女款' : '男款'} 规格数据...
          </p>
        </div>
      )}

      {/* SKU Matrix View Card */}
      <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 text-left space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2">
            <Table className="w-5 h-5 text-purple-600" />
            <h2 className="text-base font-bold text-slate-900">
              7~16 行 SKU 规格矩阵预览 ({genderFormat === 'women' ? '女款标准' : '男款标准'})
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              2色 × 5码 = 10行
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMatrix}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
            >
              {hasCopied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">已复制矩阵数据</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>复制矩阵数据</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* SKU Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
          <table className="w-full text-xs text-left border-collapse min-w-[760px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-2.5 px-3">行号</th>
                <th className="py-2.5 px-3">颜色 (CJ)</th>
                <th className="py-2.5 px-3">尺码 (CN)</th>
                <th className="py-2.5 px-3 bg-purple-50/50 text-purple-800">肩宽 (CO)</th>
                <th className="py-2.5 px-3 bg-purple-50/50 text-purple-800">胸围 (CP)</th>
                <th className="py-2.5 px-3 bg-purple-50/50 text-purple-800">衣长 (CQ)</th>
                <th className="py-2.5 px-3 bg-purple-50/50 text-purple-800">袖长 (CR)</th>
                <th className="py-2.5 px-3">供货价 (CW/CX)</th>
                <th className="py-2.5 px-3">NJ发货仓</th>
                <th className="py-2.5 px-3">GA发货仓</th>
                <th className="py-2.5 px-3">FL发货仓</th>
                <th className="py-2.5 px-3">CA发货仓</th>
                <th className="py-2.5 px-3">包装 (DW~DZ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {matrixData.map((r) => (
                <tr key={r.rowNum} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2 px-3 font-bold text-slate-400">Row {r.rowNum}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-sans font-medium border ${
                        r.color === '白色'
                          ? 'bg-white text-slate-700 border-slate-300'
                          : 'bg-slate-900 text-white border-slate-900'
                      }`}
                    >
                      {r.color}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-bold text-slate-800">{r.size}</td>
                  <td className="py-2 px-3 bg-purple-50/30 text-purple-900 font-semibold">{r.co} cm</td>
                  <td className="py-2 px-3 bg-purple-50/30 text-purple-900 font-semibold">{r.cp} cm</td>
                  <td className="py-2 px-3 bg-purple-50/30 text-purple-900 font-semibold">{r.cq} cm</td>
                  <td className="py-2 px-3 bg-purple-50/30 text-purple-900 font-semibold">{r.cr} cm</td>
                  <td className="py-2 px-3 text-slate-700 font-bold">{r.price} {r.currency}</td>
                  <td className="py-2 px-3 text-slate-500">9999</td>
                  <td className="py-2 px-3 text-slate-500">9999</td>
                  <td className="py-2 px-3 text-slate-500">9999</td>
                  <td className="py-2 px-3 text-slate-500">9999</td>
                  <td className="py-2 px-3 text-slate-400 text-[11px]">
                    {r.pkgL}*{r.pkgW}*{r.pkgH}cm / {r.pkgWeight}g
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Success Result View */}
      {result && !isProcessing && (
        <div className="mt-8 space-y-6 flex flex-col items-center">
          <div className="w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 sm:p-6 text-left space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {result.fileName}（{genderFormat === 'women' ? '女款格式' : '男款格式'}）
                  </h3>
                  <p className="text-xs text-slate-500">
                    目标工作表：<strong>{result.targetSheetName}</strong>（第 {result.targetSheetIndex + 1} 个工作表）
                  </p>
                </div>
              </div>

              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                已安全写入 {result.modifications.length} 个规格单元格
              </span>
            </div>

            {/* Modifications Inspector */}
            {result.modifications.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 mr-1">
                    <Filter className="w-3.5 h-3.5" />
                    <span>分类筛选:</span>
                  </span>
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

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 text-left max-h-72 overflow-y-auto pr-1">
                  {filteredModifications.map((mod) => (
                    <div
                      key={mod.cell}
                      className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-mono font-bold text-blue-600">
                            {mod.cell}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {mod.category}
                          </span>
                        </div>
                        <span
                          className="text-[10px] text-slate-400 block truncate"
                          title={`原值: ${mod.originalValue}`}
                        >
                          原: {mod.originalValue}
                        </span>
                      </div>
                      <div className="mt-2 pt-1 border-t border-slate-100">
                        <span
                          className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs px-1.5 py-0.5 rounded block truncate"
                          title={String(mod.value)}
                        >
                          {mod.column === 'AC' ? '65%' : mod.column === 'AE' ? '35%' : mod.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-[11px] text-slate-400 flex items-center justify-between gap-1.5 pt-1">
              <span className="flex items-center gap-1">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>未涉及单元格及其他区域保持原样不变，原有表格字体、颜色与边框 100% 完整保留。</span>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 w-full max-w-sm justify-center">
            <button
              id="btn-reimport-template"
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors cursor-pointer shadow-2xs"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
              <span>更换表格</span>
            </button>

            <button
              id="btn-export-template"
              type="button"
              onClick={handleExport}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-4 h-4" />
              <span>导出生成模板</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

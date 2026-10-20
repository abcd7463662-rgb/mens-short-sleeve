import React from 'react';
import { Box, Sparkles, Layers, ShieldCheck, ArrowLeft } from 'lucide-react';

interface FutureModuleViewProps {
  onBackToTemplate: () => void;
}

export const FutureModuleView: React.FC<FutureModuleViewProps> = ({ onBackToTemplate }) => {
  return (
    <div className="max-w-2xl mx-auto w-full py-12 px-4 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 shadow-xs">
        <Box className="w-8 h-8" />
      </div>

      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 mb-3">
        <Layers className="w-3.5 h-3.5" />
        <span>独立架构规划区</span>
      </span>

      <h2 className="text-xl font-bold text-slate-900 mb-2">
        后续新功能已规划预留隔离空间
      </h2>

      <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
        当前工程已完成模块化解耦架构。「生成模板」功能与后续要开发的其他功能各自拥有独立的文件夹、状态与处理引擎。
      </p>

      <div className="w-full bg-white rounded-2xl border border-slate-200 p-5 text-left mb-6 shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>模块隔离规范说明</span>
        </h3>
        <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
            <span><strong>完全解耦</strong>：后续新增功能（如批量转换、数据清洗、多表合并等）将独立置于对应模块目录中，绝不改动或影响「生成模板」的既有逻辑。</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
            <span><strong>规则独立配置</strong>：「生成模板」的 29 项写入规则与样式保护引擎已封装在独立模块内，可随时单独维护。</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
            <span><strong>即开即用</strong>：您提出后续功能需求时，将直接在此接入，并自动挂载至导航栏中。</span>
          </li>
        </ul>
      </div>

      <button
        type="button"
        onClick={onBackToTemplate}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>返回「生成模板」功能</span>
      </button>
    </div>
  );
};

import React from 'react';
import { Table, Sparkles, CheckCircle2 } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-xs sticky top-0 z-30">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
          <Table className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-900 tracking-tight">电商上架模板生成工作台</span>
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              双色流程
            </span>
          </div>
          <p className="text-[11px] text-slate-500 hidden sm:block">
            标题填入 C6 · 白色款直链填入 EA6~EA11 · 黑色款直链填入 EA12~EA16 · SPU/SKU规格全自动填充
          </p>
        </div>
      </div>

      {/* 3 Step Flow Badges */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold border border-slate-200">
          1. 商品信息导入
        </span>
        <span className="text-slate-300">→</span>
        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold border border-slate-200">
          2. 模板导入
        </span>
        <span className="text-slate-300">→</span>
        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
          3. 模板导出
        </span>
      </div>
    </header>
  );
};

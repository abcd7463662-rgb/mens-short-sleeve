import React from 'react';
import { Table } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
            <Table className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold text-slate-900">男士短袖上架工作台</span>
        </div>
        <span className="hidden text-xs text-slate-500 sm:block">导入商品 · 确认颜色 · 导出上架表</span>
      </div>
    </header>
  );
};

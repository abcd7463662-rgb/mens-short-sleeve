import React from 'react';
import { Shirt, Table2 } from 'lucide-react';

export type WorkspaceCategory = 'men' | 'womens-plus-tee' | 'womens-standard-tee' | 'womens-sport-tee';

interface HeaderProps {
  activeWorkspace: WorkspaceCategory;
  onWorkspaceChange: (category: WorkspaceCategory) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeWorkspace, onWorkspaceChange }) => {
  return (
    <header className="app-header sticky top-0 z-30 border-b border-blue-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
            <Table2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">短袖上架工作台</div>
            <div className="text-[11px] text-slate-500">商品处理与上架文件</div>
          </div>
        </div>
        <nav className="flex max-w-full flex-wrap items-center gap-1 rounded-md border border-blue-100 bg-blue-50 p-1" aria-label="商品类型">
          <button type="button" onClick={() => onWorkspaceChange('men')} aria-pressed={activeWorkspace === 'men'} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${activeWorkspace === 'men' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-blue-700'}`}>
            <Shirt className="h-3.5 w-3.5" /> 男士短袖
          </button>
          <button type="button" onClick={() => onWorkspaceChange('womens-plus-tee')} aria-pressed={activeWorkspace === 'womens-plus-tee'} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${activeWorkspace === 'womens-plus-tee' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-blue-700'}`}>
            <Shirt className="h-3.5 w-3.5" /> 女士大码
          </button>
          <button type="button" onClick={() => onWorkspaceChange('womens-standard-tee')} aria-pressed={activeWorkspace === 'womens-standard-tee'} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${activeWorkspace === 'womens-standard-tee' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-blue-700'}`}>
            <Shirt className="h-3.5 w-3.5" /> 女士标码
          </button>
          <button type="button" onClick={() => onWorkspaceChange('womens-sport-tee')} aria-pressed={activeWorkspace === 'womens-sport-tee'} className={`inline-flex min-h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors ${activeWorkspace === 'womens-sport-tee' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-blue-700'}`}>
            <Shirt className="h-3.5 w-3.5" /> 女士运动
          </button>
        </nav>
      </div>
    </header>
  );
};

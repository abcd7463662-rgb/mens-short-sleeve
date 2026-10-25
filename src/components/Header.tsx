import React from 'react';
import { Shirt, Table } from 'lucide-react';

interface HeaderProps {
  activeWorkspace: 'men' | 'women';
  onWorkspaceChange: (women: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeWorkspace, onWorkspaceChange }) => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
            <Table className="h-4 w-4" />
          </div>
          <span className="truncate text-sm font-semibold text-slate-900">短袖上架工作台</span>
        </div>
        <nav className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1" aria-label="商品类型">
          <button type="button" onClick={() => onWorkspaceChange(false)} aria-pressed={activeWorkspace === 'men'} className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${activeWorkspace === 'men' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            <Table className="h-3.5 w-3.5" /> 男士短袖
          </button>
          <button type="button" onClick={() => onWorkspaceChange(true)} aria-pressed={activeWorkspace === 'women'} className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${activeWorkspace === 'women' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            <Shirt className="h-3.5 w-3.5" /> 女士短袖
          </button>
        </nav>
      </div>
    </header>
  );
};

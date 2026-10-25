/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { ImageModifierView } from './features/imageModifier';
import { ImageModifierView as WomenImageModifierView } from './womens/features/imageModifier';
import { TemplateGeneratorView } from './womens/features/templateGenerator';
import { useEffect } from 'react';

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<'men' | 'women'>(() =>
    window.location.pathname.startsWith('/women') ? 'women' : 'men'
  );
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'info' | 'error' } | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setActiveWorkspace(window.location.pathname.startsWith('/women') ? 'women' : 'men');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const switchWorkspace = (women: boolean) => {
    const nextPath = women ? '/women' : '/';
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    setActiveWorkspace(women ? 'women' : 'men');
  };

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 2800);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      {/* Top Header */}
      <Header activeWorkspace={activeWorkspace} onWorkspaceChange={switchWorkspace} />

      {/* Main Workspace - 3-Step Simplified Flow */}
      <main className="flex-1 flex items-start justify-center w-full mx-auto">
        <div className={activeWorkspace === 'women' ? 'block w-full' : 'hidden'}>
          <div className="w-full">
            <WomenImageModifierView onShowToast={showToast} />
            <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
              <details className="rounded-lg border border-slate-200 bg-white">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">女款规格模板生成器</summary>
                <TemplateGeneratorView onShowToast={showToast} />
              </details>
            </div>
          </div>
        </div>
        <div className={activeWorkspace === 'men' ? 'block w-full' : 'hidden'}>
          <ImageModifierView onShowToast={showToast} />
        </div>
      </main>

      {/* Toast Feedback */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 border ${
              toast.type === 'success'
                ? 'bg-emerald-800 text-white border-emerald-700'
                : toast.type === 'error'
                  ? 'bg-rose-800 text-white border-rose-700'
                  : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Header, WorkspaceCategory } from './components/Header';
import { ImageModifierView } from './features/imageModifier';
import { ImageModifierView as WomenImageModifierView } from './womens/features/imageModifier';
import { useEffect } from 'react';

export default function App() {
  const categoryFromPath = (): WorkspaceCategory => window.location.pathname.includes('/women/sport')
    ? 'womens-sport-tee'
    : window.location.pathname.includes('/women/standard') ? 'womens-standard-tee'
      : window.location.pathname.startsWith('/women') ? 'womens-plus-tee' : 'men';
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceCategory>(categoryFromPath);
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'info' | 'error' } | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setActiveWorkspace(categoryFromPath());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const switchWorkspace = (category: WorkspaceCategory) => {
    const nextPath = category === 'men' ? '/' : category === 'womens-sport-tee' ? '/women/sport' : category === 'womens-standard-tee' ? '/women/standard' : '/women/plus';
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    setActiveWorkspace(category);
  };

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, 2800);
  }, []);

  return (
    <div className="app-shell min-h-screen flex flex-col text-slate-900 font-sans">
      {/* Top Header */}
      <Header activeWorkspace={activeWorkspace} onWorkspaceChange={switchWorkspace} />

      {/* Main Workspace - 3-Step Simplified Flow */}
      <main className="flex-1 flex items-start justify-center w-full mx-auto">
        <div className={activeWorkspace !== 'men' ? 'block w-full' : 'hidden'}>
          <div className="w-full">
            <WomenImageModifierView onShowToast={showToast} initialCategory={activeWorkspace === 'womens-sport-tee' ? 'womens-sport-tee' : activeWorkspace === 'womens-standard-tee' ? 'womens-standard-tee' : 'womens-plus-tee'} />
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

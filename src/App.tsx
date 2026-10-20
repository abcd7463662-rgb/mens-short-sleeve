/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { ImageModifierView } from './features/imageModifier';

export default function App() {
  const [toast, setToast] = useState<{ id: number; message: string; type: 'success' | 'info' | 'error' } | null>(null);

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
      <Header />

      {/* Main Workspace - 3-Step Simplified Flow */}
      <main className="flex-1 flex items-start justify-center w-full mx-auto">
        <ImageModifierView onShowToast={showToast} />
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

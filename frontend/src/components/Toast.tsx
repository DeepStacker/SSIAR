import React from 'react';
import { useToast } from '@/context/ToastContext';

export const Toast: React.FC = () => {
  const { toast, dismiss } = useToast();
  if (!toast) return null;

  const duration = Math.max(0, toast.dismissAt - Date.now());

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-6 right-6 z-[99999] flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg"
      style={{
        background: toast.type === 'success' ? 'rgba(16,185,129,0.95)' : 'rgba(244,63,94,0.95)',
        animation: 'enter 0.3s ease-out',
        '--tw-enter-opacity': '0',
        '--tw-enter-translate-x': '100%',
      } as React.CSSProperties}
    >
      <style>{`@keyframes toast-shrink { from { width: 100%; } to { width: 0%; } }`}</style>
      <span className="flex-1 flex items-center gap-2">
        {(toast.message.includes('Download') || toast.message.includes('Export')) && (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        {toast.message}
      </span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            dismiss();
          }}
          className="font-bold underline underline-offset-2 hover:opacity-80 whitespace-nowrap"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss notification"
        className="flex items-center justify-center rounded-md p-1 hover:bg-white/20 leading-none text-lg"
      >
        ×
      </button>
      <div
        className="absolute bottom-0 left-0 h-0.5 rounded-b-lg"
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.6)',
          animation: `toast-shrink ${duration}ms linear forwards`,
        }}
      />
    </div>
  );
};

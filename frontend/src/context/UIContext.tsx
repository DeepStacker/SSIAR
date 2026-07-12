import React, { createContext, useContext, useState } from 'react';
import type { ViewMode } from '@/api';

interface UIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  uploading: boolean;
  setUploading: React.Dispatch<React.SetStateAction<boolean>>;
  isDragOver: boolean;
  setIsDragOver: React.Dispatch<React.SetStateAction<boolean>>;
  view: ViewMode;
  setView: React.Dispatch<React.SetStateAction<ViewMode>>;
  confirmState: { title: string; description: string; confirmLabel?: string; confirmVariant?: 'default' | 'destructive'; onConfirm: () => void } | null;
  setConfirmState: React.Dispatch<React.SetStateAction<{ title: string; description: string; confirmLabel?: string; confirmVariant?: 'default' | 'destructive'; onConfirm: () => void } | null>>;
}

const UIContext = createContext<UIState | null>(null);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [view, setView] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('view') as ViewMode) || 'dashboard';
  });
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel?: string; confirmVariant?: 'default' | 'destructive'; onConfirm: () => void } | null>(null);

  return (
    <UIContext.Provider value={{
      sidebarCollapsed, setSidebarCollapsed,
      uploading, setUploading,
      isDragOver, setIsDragOver,
      view, setView,
      confirmState, setConfirmState,
    }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
};

import React, { createContext, useContext, useState } from 'react';
import type { ViewMode, TabType, SortKey } from '@/api';

interface UIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  uploading: boolean;
  setUploading: React.Dispatch<React.SetStateAction<boolean>>;
  view: ViewMode;
  setView: React.Dispatch<React.SetStateAction<ViewMode>>;
  confirmState: { title: string; description: string; confirmLabel?: string; confirmVariant?: 'default' | 'destructive'; onConfirm: () => void } | null;
  setConfirmState: React.Dispatch<React.SetStateAction<{ title: string; description: string; confirmLabel?: string; confirmVariant?: 'default' | 'destructive'; onConfirm: () => void } | null>>;
  sortKey: SortKey;
  setSortKey: React.Dispatch<React.SetStateAction<SortKey>>;
  sortDir: 'asc' | 'desc';
  setSortDir: React.Dispatch<React.SetStateAction<'asc' | 'desc'>>;
  activeTab: TabType;
  setActiveTab: React.Dispatch<React.SetStateAction<TabType>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}

const UIContext = createContext<UIState | null>(null);

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState<ViewMode>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('view') as ViewMode) || 'dashboard';
  });
  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel?: string; confirmVariant?: 'default' | 'destructive'; onConfirm: () => void } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <UIContext.Provider value={{
      sidebarCollapsed, setSidebarCollapsed,
      uploading, setUploading,
      view, setView,
      confirmState, setConfirmState,
      sortKey, setSortKey,
      sortDir, setSortDir,
      activeTab, setActiveTab,
      searchQuery, setSearchQuery,
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

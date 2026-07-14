import React, { createContext, useContext, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ViewMode, TabType, SortKey } from '@/api';

export const VIEW_PATHS: Record<ViewMode, string> = {
  dashboard: '/app/dashboard',
  reporting: '/app/reporting',
  analytics: '/app/analytics',
  dlq: '/app/dlq',
  users: '/app/users',
  feedback: '/app/feedback',
};

export function getViewFromPath(pathname: string): ViewMode {
  if (pathname.startsWith('/app/reporting')) return 'reporting';
  if (pathname.startsWith('/app/analytics')) return 'analytics';
  if (pathname.startsWith('/app/dlq')) return 'dlq';
  if (pathname.startsWith('/app/users')) return 'users';
  if (pathname.startsWith('/app/feedback')) return 'feedback';
  return 'dashboard';
}

interface UIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarMobileOpen: boolean;
  setSidebarMobileOpen: React.Dispatch<React.SetStateAction<boolean>>;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const location = useLocation();
  const navigate = useNavigate();
  
  const view = getViewFromPath(location.pathname);
  
  const setView = useCallback((newView: React.SetStateAction<ViewMode>) => {
    const nextView = typeof newView === 'function' ? newView(view) : newView;
    navigate(VIEW_PATHS[nextView]);
  }, [view, navigate]);

  const [confirmState, setConfirmState] = useState<{ title: string; description: string; confirmLabel?: string; confirmVariant?: 'default' | 'destructive'; onConfirm: () => void } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <UIContext.Provider value={{
      sidebarCollapsed, setSidebarCollapsed,
      sidebarMobileOpen, setSidebarMobileOpen,
      uploading, setUploading,
      view, setView: setView as any,
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

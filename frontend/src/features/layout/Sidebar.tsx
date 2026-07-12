import React from 'react';
import {
  AlertOctagon,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Users,
  X,
} from 'lucide-react';
import type { ViewMode } from '@/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useDocument } from '@/context/DocumentContext';
import { AppLogo } from '@/components/app/AppLogo';

const navItems: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { id: 'reporting', label: 'Reporting', icon: <FileText size={18} /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
  { id: 'dlq', label: 'DLQ', icon: <AlertOctagon size={18} /> },
];

interface Props {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar: React.FC<Props> = ({
  view, onViewChange, collapsed, onToggle,
  mobileOpen = false, onMobileClose,
}) => {
  const { role } = useAuth();
  const { needsReview, queueStatus, documents } = useDocument();

  const items = [...navItems];
  if (role === 'admin') {
    items.push({ id: 'users', label: 'Users', icon: <Users size={18} /> });
  }

  const reviewCount = queueStatus?.needs_review ?? needsReview.length;
  const failedCount = queueStatus?.failed ?? documents.filter(d => d.status === 'failed').length;

  const getBadge = (id: ViewMode) => {
    if (id === 'dashboard' && reviewCount > 0) {
      return (
        <span className={cn(
          "ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none",
          "bg-[var(--accent-amber)]/15 text-[var(--accent-amber)]",
          collapsed && "absolute -top-1 -right-1"
        )}>
          {reviewCount > 99 ? '99+' : reviewCount}
        </span>
      );
    }
    if (id === 'dlq' && failedCount > 0) {
      return (
        <span className={cn(
          "ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none",
          "bg-[var(--accent-rose)]/15 text-[var(--accent-rose)]",
          collapsed && "absolute -top-1 -right-1"
        )}>
          {failedCount > 99 ? '99+' : failedCount}
        </span>
      );
    }
    return null;
  };

  const handleViewChange = (v: ViewMode) => {
    onViewChange(v);
    onMobileClose?.();
  };

  const renderContent = () => (
    <>
      <div className={cn(
        "flex items-center shrink-0 border-b border-border",
        collapsed ? "justify-center h-14 px-2" : "px-5 h-14 gap-2.5"
      )}>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground xl:hidden"
            aria-label="Close sidebar"
          >
            <X size={16} />
          </button>
        )}
        {collapsed ? (
          <AppLogo compact />
        ) : (
          <AppLogo subtitle="Operations workspace" />
        )}
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1" aria-label="Main navigation">
        {items.map(item => {
          const isActive = view === item.id;
          const badge = getBadge(item.id);
          return (
            <div key={item.id} className="relative">
              <button
                onClick={() => handleViewChange(item.id)}
                className={cn(
                  "flex items-center rounded-lg text-xs font-medium transition-colors w-full group relative",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2 text-left",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={cn(
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <>
                    <span>{item.label}</span>
                    {badge}
                  </>
                )}
              </button>
              {collapsed && badge}
            </div>
          );
        })}
      </nav>

      <div className={cn(
        "border-t border-border",
        collapsed ? "p-2 flex justify-center" : "p-2"
      )}>
        <button
          onClick={onToggle}
          className={cn(
            "flex items-center justify-center rounded-lg py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
            collapsed ? "w-full" : "w-full gap-1.5 text-[10px]"
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={14} /> Collapse</>}
        </button>
      </div>
    </>
  );

  return (
    <>
      <aside className={cn(
        "no-print border-r border-border bg-card flex flex-col py-0 shrink-0 min-h-0 transition-all duration-300",
        "hidden xl:flex",
        collapsed ? "w-16" : "w-44"
      )}>
        {renderContent()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className={cn(
            "relative h-full w-56 flex flex-col py-0 shrink-0 min-h-0 border-r border-border bg-card"
          )}>
            {renderContent()}
          </aside>
        </div>
      )}
    </>
  );
};

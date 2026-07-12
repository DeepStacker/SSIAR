import React from 'react';
import { LayoutDashboard, FileText, BarChart3, AlertOctagon, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import type { ViewMode } from '@/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useDocument } from '@/context/DocumentContext';

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
}

export const Sidebar: React.FC<Props> = ({ view, onViewChange, collapsed, onToggle }) => {
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

  return (
    <aside className={cn(
      "border-r border-[var(--color-border)] bg-[var(--bg-card)] flex flex-col py-0 shrink-0 min-h-0 transition-all duration-300",
      "backdrop-blur-xl",
      collapsed ? "w-16" : "w-44"
    )}>
      <div className={cn(
        "flex items-center shrink-0 border-b border-[var(--color-border)]",
        collapsed ? "justify-center h-14 px-2" : "px-5 h-14 gap-2.5"
      )}>
        <div className="relative shrink-0">
          <img src="/logo.png" alt="SSIAR" className="h-7 w-auto relative z-10" />
          {!collapsed && (
            <div className="absolute -inset-1 bg-gradient-to-r from-[var(--accent-violet)]/20 to-transparent rounded-full blur-sm" />
          )}
        </div>
        {!collapsed && (
          <span className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-[var(--accent-violet)] to-[var(--accent-cyan)] bg-clip-text text-transparent">
            SSIAR
          </span>
        )}
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1" aria-label="Main navigation">
        {items.map(item => {
          const isActive = view === item.id;
          const badge = getBadge(item.id);
          return (
            <div key={item.id} className="relative">
              <button
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "flex items-center rounded-lg text-xs font-medium transition-all duration-200 w-full group relative",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2 text-left",
                  isActive
                    ? "bg-[var(--bg-highlight)] text-[var(--accent-violet)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)]/50"
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[var(--accent-violet)]" />
                )}
                <span className={cn(
                  "transition-colors",
                  isActive ? "text-[var(--accent-violet)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
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
        "border-t border-[var(--color-border)]",
        collapsed ? "p-2 flex justify-center" : "p-2"
      )}>
        <button
          onClick={onToggle}
          className={cn(
            "flex items-center justify-center rounded-lg py-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-highlight)]/50 transition-all duration-200",
            collapsed ? "w-full" : "w-full gap-1.5 text-[10px]"
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={14} /> Collapse</>}
        </button>
      </div>
    </aside>
  );
};

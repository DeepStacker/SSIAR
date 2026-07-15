import React from 'react';
import {
  AlertOctagon, BarChart3, ChevronLeft, ChevronRight,
  FileText, LayoutDashboard, MessageSquare, Users, X, LogOut,
} from 'lucide-react';
import type { ViewMode } from '@/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useDocument } from '@/context/DocumentContext';

const navGroups: { label: string; items: { id: ViewMode; label: string; icon: React.ReactNode }[] }[] = [
  {
    label: 'Main',
    items: [
      { id: 'verify', label: 'Verify', icon: <AlertOctagon size={18} className="text-orange-500" /> },
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { id: 'reporting', label: 'Reporting', icon: <FileText size={18} /> },
      { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
      { id: 'feedback', label: 'Feedback', icon: <MessageSquare size={18} /> },
    ],
  },
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
  const { role, email } = useAuth();
  const { needsReview, queueStatus, documents } = useDocument();

  const groups = [...navGroups];
  if (role === 'admin') {
    groups.push({
      label: 'Admin',
      items: [{ id: 'users', label: 'Users', icon: <Users size={18} /> }],
    });
  }

  const reviewCount = queueStatus?.needs_review ?? needsReview.length;
  const failedCount = queueStatus?.failed ?? documents.filter(d => d.status === 'failed').length;

  const getBadge = (id: ViewMode) => {
    if (id === 'dashboard' && reviewCount > 0) {
      return <span className={cn("ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive min-w-[18px] text-center leading-tight", collapsed && "absolute -top-1 -right-1")}>{reviewCount > 99 ? '99+' : reviewCount}</span>;
    }
    if (id === 'verify' && failedCount > 0) {
      return <span className={cn("ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive min-w-[18px] text-center leading-tight", collapsed && "absolute -top-1 -right-1")}>{failedCount > 99 ? '99+' : failedCount}</span>;
    }
    return null;
  };

  const handleViewChange = (v: ViewMode) => { onViewChange(v); onMobileClose?.(); };

  const [hovered, setHovered] = React.useState(false);
  const isExpanded = !collapsed || hovered;

  const navButton = (item: { id: ViewMode; label: string; icon: React.ReactNode }) => {
    const isActive = view === item.id;
    const badge = getBadge(item.id);
    const btn = (
      <button
        onClick={() => handleViewChange(item.id)}
        className={cn(
          "group relative flex items-center w-full rounded-lg text-sm font-medium transition-all duration-150 outline-none",
          isExpanded ? "gap-3 px-3 py-2.5" : "justify-center px-0 py-3 mx-auto",
          isActive
            ? "bg-primary/8 text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}
        aria-current={isActive ? 'page' : undefined}
      >
        {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary" />}
        <span className={cn("shrink-0", isActive ? "text-primary" : "")}>{item.icon}</span>
        {isExpanded && <><span className="flex-1 text-left truncate">{item.label}</span>{badge}</>}
        {!isExpanded && <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-xs font-medium px-2.5 py-1.5 rounded-md shadow-md whitespace-nowrap">{item.label}</span>}
      </button>
    );
    if (!isExpanded && !hovered) {
      return <div key={item.id} className="relative">{btn}{badge}</div>;
    }
    return <div key={item.id}>{btn}</div>;
  };

  const renderContent = () => (
    <>
      {onMobileClose && (
        <button onClick={onMobileClose} className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden" aria-label="Close sidebar">
          <X size={16} />
        </button>
      )}

      <div className="flex flex-col h-full">
        {/* Logo area */}
        <div className={cn("flex items-center shrink-0 border-b border-border", isExpanded ? "px-4 py-3.5 justify-between" : "px-0 py-3.5 justify-center")}>
          {isExpanded ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">S</div>
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-tight truncate">SSIAR</div>
                  <div className="text-[9px] text-muted-foreground/60 leading-tight truncate">Document Platform</div>
                </div>
              </div>
              <button onClick={onToggle} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors -mr-1" title="Collapse sidebar">
                <ChevronLeft size={14} />
              </button>
            </>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">S</div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label="Main navigation">
          {groups.map(group => (
            <div key={group.label}>
              {isExpanded && (
                <div className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40">{group.label}</div>
              )}
              <div className="space-y-0.5">
                {group.items.map(navButton)}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className={cn("border-t border-border shrink-0", isExpanded ? "px-3 py-3" : "px-1 py-2")}>
          {isExpanded ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                  {(email || 'U')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{email || 'User'}</div>
                  <div className="text-[9px] text-muted-foreground/60 capitalize">{role || 'user'}</div>
                </div>
              </div>
              <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }} className="rounded-md p-1.5 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors" title="Logout">
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                {(email || 'U')[0].toUpperCase()}
              </div>
              <button onClick={onToggle} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Expand sidebar">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className={cn(
        "no-print border-r border-border bg-card flex flex-col shrink-0 min-h-0 transition-all duration-200 ease-in-out",
        "hidden lg:flex",
        isExpanded ? "w-56" : "w-16"
      )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ transitionProperty: 'width, box-shadow' }}
      >
        {renderContent()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="relative h-full w-60 flex flex-col border-r border-border bg-card shadow-xl">
            {renderContent()}
          </aside>
        </div>
      )}
    </>
  );
};

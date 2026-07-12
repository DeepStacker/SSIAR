import React from 'react';
import {
  AlertOctagon, BarChart3, ChevronLeft,
  FileText, LayoutDashboard, Users, X,
} from 'lucide-react';
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
  if (role === 'admin') items.push({ id: 'users', label: 'Users', icon: <Users size={18} /> });

  const reviewCount = queueStatus?.needs_review ?? needsReview.length;
  const failedCount = queueStatus?.failed ?? documents.filter(d => d.status === 'failed').length;

  const getBadge = (id: ViewMode) => {
    if (id === 'dashboard' && reviewCount > 0) {
      return <span className={cn("ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive min-w-[18px] text-center", collapsed && "absolute -top-1 -right-1")}>{reviewCount > 99 ? '99+' : reviewCount}</span>;
    }
    if (id === 'dlq' && failedCount > 0) {
      return <span className={cn("ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive min-w-[18px] text-center", collapsed && "absolute -top-1 -right-1")}>{failedCount > 99 ? '99+' : failedCount}</span>;
    }
    return null;
  };

  const handleViewChange = (v: ViewMode) => { onViewChange(v); onMobileClose?.(); };

  const [hovered, setHovered] = React.useState(false);
  const isExpanded = !collapsed || hovered;

  const renderContent = () => (
    <>
      {onMobileClose && (
        <button onClick={onMobileClose} className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground xl:hidden" aria-label="Close sidebar">
          <X size={16} />
        </button>
      )}

      <nav className="flex flex-col gap-0.5 px-2.5 pt-4 pb-3 flex-1" aria-label="Main navigation">
        {items.map(item => {
          const isActive = view === item.id;
          const badge = getBadge(item.id);
          return (
            <div key={item.id} className="relative">
              <button
                onClick={() => handleViewChange(item.id)}
                className={cn(
                  "flex items-center w-full rounded-md text-sm font-medium transition-colors whitespace-nowrap overflow-hidden",
                  isExpanded ? "gap-3 px-3 py-2" : "justify-center px-0 py-2.5",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                aria-current={isActive ? 'page' : undefined}>
                <span className={isActive ? "text-primary" : ""}>{item.icon}</span>
                {isExpanded && <><span className="flex-1 text-left">{item.label}</span>{badge}</>}
              </button>
              {!isExpanded && badge}
            </div>
          );
        })}
      </nav>

      {isExpanded && (
        <div className="border-t border-border px-2.5 py-2">
          <button onClick={onToggle} className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Collapse sidebar">
            <ChevronLeft size={14} /> Collapse
          </button>
        </div>
      )}
    </>
  );

  return (
    <>
      <aside className={cn(
        "no-print border-r border-border bg-card flex flex-col shrink-0 min-h-0 transition-all duration-200",
        "hidden xl:flex",
        hovered ? "w-52 shadow-md" : collapsed ? "w-16" : "w-52"
      )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {renderContent()}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className="relative h-full w-60 flex flex-col border-r border-border bg-card">
            {renderContent()}
          </aside>
        </div>
      )}
    </>
  );
};

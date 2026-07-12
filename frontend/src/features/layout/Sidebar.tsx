import React from 'react';
import { LayoutDashboard, FileText, BarChart3, AlertOctagon, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ViewMode } from '@/api';
import { cn } from '@/lib/utils';

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
  return (
    <aside className={cn(
      "border-r bg-card flex flex-col py-4 shrink-0 min-h-0 transition-all duration-200",
      collapsed ? "w-16" : "w-44"
    )}>
      <div className={cn("mb-6", collapsed ? "px-4" : "px-4")}>
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="SSIAR" className="h-6 w-auto shrink-0" />
          {!collapsed && <span className="font-bold text-sm tracking-tight">SSIAR</span>}
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 flex-1" aria-label="Main navigation">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "flex items-center rounded-md text-xs font-medium transition-colors w-full",
              collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-3 py-1.5 text-left",
              view === item.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
            aria-current={view === item.id ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      <div className={cn("px-2", collapsed && "flex justify-center")}>
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full rounded-md py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  );
};

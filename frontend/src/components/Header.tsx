import React from 'react';
import { Moon, Sun, LogOut, Printer } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import type { ViewMode } from '../api';
import { Button } from '@/components/ui/button';

interface Props {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}

export const Header: React.FC<Props> = ({ view }) => {
  const { dark, toggle } = useTheme();
  const { email, logout } = useAuth();

  return (
    <header className="h-14 border-b bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {email && <span>{email}</span>}
      </div>
      <div className="flex items-center gap-2">
        {view === 'analytics' && (
          <Button variant="outline" size="sm" onClick={() => window.print()} aria-label="Print analytics report" className="no-print">
            <Printer size={14} /> Print
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </Button>
        <Button variant="outline" size="icon" onClick={logout} aria-label="Sign out" title="Sign out">
          <LogOut size={14} />
        </Button>
      </div>
    </header>
  );
};

import React from 'react';
import { Moon, Sun, Printer } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { ViewMode } from '../api';
import { Button } from '@/components/ui/button';

interface Props {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}

export const Header: React.FC<Props> = ({ view, onViewChange }) => {
  const { dark, toggle } = useTheme();

  return (
    <header className="flex items-center justify-between border-b pb-5 mb-8">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="SSIAR" className="h-8 w-auto" />
      </div>
      <nav aria-label="Main navigation" className="flex items-center gap-1">
        <Button
          variant={view === 'dashboard' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('dashboard')}
          aria-current={view === 'dashboard' ? 'page' : undefined}
        >
          Dashboard
        </Button>
        <Button
          variant={view === 'reporting' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('reporting')}
          aria-current={view === 'reporting' ? 'page' : undefined}
        >
          Reporting
        </Button>
        <Button
          variant={view === 'analytics' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('analytics')}
          aria-current={view === 'analytics' ? 'page' : undefined}
        >
          Analytics
        </Button>
        {view === 'analytics' && (
          <Button variant="outline" size="sm" onClick={() => window.print()} aria-label="Print analytics report" className="no-print">
            <Printer size={14} /> Print Report
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </Button>
      </nav>
    </header>
  );
};

import React from 'react';
import { Moon, Sun } from 'lucide-react';
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
      <div className="flex items-center gap-3 text-[22px] font-extrabold tracking-tight">
        <span>SSIAR SDQ Digitization</span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant={view === 'dashboard' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('dashboard')}
        >
          Dashboard
        </Button>
        <Button
          variant={view === 'reporting' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('reporting')}
        >
          Reporting
        </Button>
        <Button
          variant={view === 'analytics' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onViewChange('analytics')}
        >
          Analytics
        </Button>
        <Button variant="outline" size="icon" onClick={toggle}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </Button>
      </div>
    </header>
  );
};

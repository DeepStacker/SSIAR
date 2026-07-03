import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { ViewMode } from '../api';

interface Props {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}

export const Header: React.FC<Props> = ({ view, onViewChange }) => {
  const { dark, toggle } = useTheme();

  return (
    <header className="main-header">
      <div className="logo">
        <span>SSIAR SDQ Digitization</span>
      </div>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <button
          onClick={() => onViewChange('dashboard')}
          className={`btn ${view === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          Dashboard
        </button>
        <button
          onClick={() => onViewChange('reporting')}
          className={`btn ${view === 'reporting' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          Reporting
        </button>
        <button onClick={toggle} className="btn btn-secondary" style={{ padding: '6px 8px', fontSize: '12px', lineHeight: 0 }}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
};

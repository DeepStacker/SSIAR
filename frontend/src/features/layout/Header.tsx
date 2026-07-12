import React, { useState } from 'react';
import { Moon, Sun, LogOut, Printer, Settings, Key, ChevronRight, Home } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import type { ViewMode } from '@/api';
import { Button } from '@/components/ui/button';
import { API_BASE, extractErrorMessage } from '@/api';
import { useToast } from '@/context/ToastContext';

interface Props {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}

const BREADCRUMB_LABELS: Record<ViewMode, string> = {
  dashboard: 'Dashboard',
  reporting: 'Reporting',
  analytics: 'Analytics',
  dlq: 'Dead Letter Queue',
  users: 'Users',
};

export const Header: React.FC<Props> = ({ view }) => {
  const { dark, toggle } = useTheme();
  const { email, token, logout } = useAuth();
  const { show: showToast } = useToast();

  const [showSettings, setShowSettings] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data) || 'Failed to change password');
      showToast('Password updated successfully', 'success');
      setShowSettings(false);
      setOldPassword('');
      setNewPassword('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to change password', 'error');
    } finally {
      setLoading(false);
    }
  };

  const initials = email
    ? email.split('@')[0].slice(0, 2).toUpperCase()
    : '??';

  return (
    <>
      <header className="h-14 glass-card border-b border-[var(--color-border)] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => view !== 'dashboard' && (window.location.hash = '')}
            className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--accent-violet)] transition-colors"
          >
            <Home size={12} />
          </button>
          <ChevronRight size={10} className="text-[var(--text-muted)]" />
          <span className="font-semibold text-[var(--text-secondary)] tracking-wide">
            {BREADCRUMB_LABELS[view] || view}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {view === 'analytics' && (
            <Button variant="outline" size="sm" onClick={() => window.print()} aria-label="Print analytics report" className="no-print gap-1.5">
              <Printer size={14} /> Print
            </Button>
          )}
          <div className="flex items-center gap-2 ml-1 pl-2 border-l border-[var(--color-border)]">
            <div
              className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-violet)] to-[var(--accent-cyan)] flex items-center justify-center text-[10px] font-extrabold text-white shadow-sm"
              title={email || 'User'}
              aria-label={`Signed in as ${email}`}
            >
              {initials}
            </div>
            <span className="hidden sm:inline text-[11px] text-[var(--text-muted)] max-w-[120px] truncate">
              {email}
            </span>
          </div>
          <div className="w-px h-5 bg-[var(--color-border)]" />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSettings(!showSettings)} aria-label="Account Settings" title="Change Password">
            <Settings size={14} className="text-[var(--text-muted)]" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? <Sun size={14} className="text-[var(--text-muted)]" /> : <Moon size={14} className="text-[var(--text-muted)]" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout} aria-label="Sign out" title="Sign out">
            <LogOut size={14} className="text-[var(--text-muted)]" />
          </Button>
        </div>
      </header>

      {showSettings && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border rounded-xl shadow-lg w-full max-w-sm p-6 relative glass-card">
            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Key size={16} className="text-[var(--accent-violet)]" />
              Change Password
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[var(--text-muted)] font-semibold">Current Password</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  className="w-full bg-[var(--bg-highlight)]/30 border border-[var(--color-border)] rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-[var(--accent-violet)] focus:ring-1 focus:ring-[var(--accent-violet)]/30 transition-all"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[var(--text-muted)] font-semibold">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-[var(--bg-highlight)]/30 border border-[var(--color-border)] rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-[var(--accent-violet)] focus:ring-1 focus:ring-[var(--accent-violet)]/30 transition-all"
                  required
                  minLength={8}
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" type="button" onClick={() => setShowSettings(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="bg-[var(--accent-violet)] hover:bg-[var(--accent-violet)]/90">
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

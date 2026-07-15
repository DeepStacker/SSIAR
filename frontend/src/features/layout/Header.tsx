import React, { useState } from 'react';
import { Moon, Sun, LogOut, Settings, Key, ChevronRight, Home, Menu } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useUI } from '@/context/UIContext';
import type { ViewMode } from '@/api';
import { Button } from '@/components/ui/button';
import { API_BASE, extractErrorMessage } from '@/api';
import { useToast } from '@/context/ToastContext';
import { AppLogo } from '@/components/app/AppLogo';

interface Props {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}

const BREADCRUMB_LABELS: Record<ViewMode, string> = {
  dashboard: 'Dashboard',
  reporting: 'Reporting',
  analytics: 'Analytics',
  verify: 'Verify',
  users: 'Users',
  feedback: 'Feedback',
};

export const Header: React.FC<Props> = React.memo(({ view, onViewChange }) => {
  const { dark, toggle } = useTheme();
  const { email, token, logout } = useAuth();
  const { show: showToast } = useToast();
  const ui = useUI();

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
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => ui.setSidebarMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </Button>
          <AppLogo className="shrink-0" />
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <button
              onClick={() => onViewChange('dashboard')}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Go to Dashboard"
            >
              <Home size={12} />
            </button>
            <ChevronRight size={10} className="text-muted-foreground" />
            <button
              onClick={() => view !== 'dashboard' && onViewChange(view)}
              className="font-medium text-foreground hover:text-primary transition-colors"
            >
              {BREADCRUMB_LABELS[view] || view}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 ml-1 pl-2 border-l border-border">
            <div
              className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-semibold text-primary-foreground"
              title={email || 'User'}
              aria-label={`Signed in as ${email}`}
            >
              {initials}
            </div>
            <span className="hidden sm:inline text-[11px] text-muted-foreground max-w-[120px] truncate">
              {email}
            </span>
          </div>
          <div className="w-px h-5 bg-border" />
          <Button variant="ghost" size="icon-sm" onClick={() => setShowSettings(!showSettings)} aria-label="Account Settings" title="Change Password">
            <Settings size={14} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out" title="Sign out">
            <LogOut size={14} />
          </Button>
        </div>
      </header>

      {showSettings && (
        <div className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-lg w-full max-w-sm p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Key size={16} />
              Change Password
            </h3>
            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-muted-foreground font-medium">Current Password</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-foreground bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-muted-foreground font-medium">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-foreground bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                  required
                  minLength={8}
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" type="button" onClick={() => setShowSettings(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
});

import React, { useState } from 'react';
import { Loader2, Mail, Lock, KeyRound, Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { API_BASE, extractErrorMessage } from '@/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const LoginPage: React.FC = () => {
  const { login, register, loading: authLoading } = useAuth();
  const [view, setView] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      if (view === 'login') {
        await login(email, password);
      } else if (view === 'register') {
        await register(email, password);
      } else if (view === 'forgot') {
        setLoading(true);
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(extractErrorMessage(data) || 'Forgot password failed');
        setMessage(data.message + (data.token ? ` Dev Token: ${data.token}` : ''));
        if (data.token) setToken(data.token);
        setView('reset');
      } else if (view === 'reset') {
        setLoading(true);
        const res = await fetch(`${API_BASE}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(extractErrorMessage(data) || 'Reset password failed');
        setMessage('Password successfully reset! Please sign in.');
        setView('login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const isBusy = authLoading || loading;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[400px] md:w-[500px] h-[300px] sm:h-[400px] md:h-[500px] pointer-events-none bg-[radial-gradient(circle,rgba(99,102,241,0.05),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(129,140,248,0.03),transparent_70%)]" />
      
      <div className="relative w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-4 duration-300">
        <Card className="border border-border/80 bg-card shadow-[var(--shadow-lg)]">
          <CardHeader className="space-y-6 pt-8 pb-4 text-center">
            <div className="flex justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-muted/40 shadow-sm">
                <Shield className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-xl font-bold tracking-tight">
                {view === 'login' && 'Sign in to workspace'}
                {view === 'register' && 'Create account'}
                {view === 'forgot' && 'Forgot password'}
                {view === 'reset' && 'Reset password'}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                {view === 'login' && 'Enter your credentials to access the workspace.'}
                {view === 'register' && 'Create an account for a new reviewer or operator.'}
                {view === 'forgot' && 'Request a reset token for your account.'}
                {view === 'reset' && 'Enter the token and set a new password.'}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 pb-8">
            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-semibold text-destructive">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-xs font-semibold text-green-600 dark:text-green-400">
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {view !== 'reset' && (
                <div className="space-y-2 text-left">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="pl-10 h-10 rounded-lg border-border/80 focus-visible:ring-primary"
                    />
                  </div>
                </div>
              )}

              {view === 'reset' && (
                <div className="space-y-2 text-left">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reset Token</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      value={token}
                      onChange={e => setToken(e.target.value)}
                      required
                      placeholder="Paste token"
                      className="pl-10 h-10 rounded-lg border-border/80 focus-visible:ring-primary"
                    />
                  </div>
                </div>
              )}

              {view !== 'forgot' && (
                <div className="space-y-2 text-left">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {view === 'reset' ? 'New Password' : 'Password'}
                    </label>
                    {view === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setView('forgot'); setError(''); setMessage(''); }}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="••••••••"
                      className="pl-10 h-10 rounded-lg border-border/80 focus-visible:ring-primary"
                    />
                  </div>
                </div>
              )}

              <Button type="submit" size="lg" disabled={isBusy} className="w-full h-10 rounded-lg font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity mt-2">
                {isBusy && <Loader2 size={16} className="animate-spin mr-2" />}
                {view === 'login' && 'Sign in'}
                {view === 'register' && 'Register'}
                {view === 'forgot' && 'Send token'}
                {view === 'reset' && 'Reset password'}
              </Button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-3 text-muted-foreground">or</span>
              </div>
            </div>

            <div className="text-center text-xs">
              {view === 'login' && (
                <button
                  onClick={() => { setView('register'); setError(''); setMessage(''); }}
                  className="font-semibold text-primary hover:opacity-85 transition-opacity"
                >
                  Create an operator account
                </button>
              )}

              {view === 'register' && (
                <button
                  onClick={() => { setView('login'); setError(''); setMessage(''); }}
                  className="font-semibold text-primary hover:opacity-85 transition-opacity"
                >
                  Already have an account? Sign in
                </button>
              )}

              {(view === 'forgot' || view === 'reset') && (
                <button
                  onClick={() => { setView('login'); setError(''); setMessage(''); }}
                  className="font-semibold text-primary hover:opacity-85 transition-opacity"
                >
                  Back to sign in
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

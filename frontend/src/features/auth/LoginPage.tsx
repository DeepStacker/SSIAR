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
    <div className="relative flex min-h-screen items-center justify-center bg-background px-3 sm:px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.06),transparent_50%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(129,140,248,0.03),transparent_50%)]" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] sm:w-[800px] sm:h-[400px] pointer-events-none bg-[radial-gradient(ellipse_at_bottom,rgba(99,102,241,0.03),transparent_60%)] dark:bg-[radial-gradient(ellipse_at_bottom,rgba(129,140,248,0.02),transparent_60%)]" />
      
      <div className="relative w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="border border-border/60 bg-card/95 backdrop-blur shadow-xl">
          <CardHeader className="space-y-6 pt-8 sm:pt-10 pb-4 sm:pb-5 text-center">
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 shadow-sm">
                <Shield className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
                {view === 'login' && 'Welcome back'}
                {view === 'register' && 'Create account'}
                {view === 'forgot' && 'Reset password'}
                {view === 'reset' && 'Set new password'}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground/80 max-w-[280px] mx-auto">
                {view === 'login' && 'Sign in to access the SSIAR workspace.'}
                {view === 'register' && 'Create an account for a new operator or reviewer.'}
                {view === 'forgot' && 'Enter your email to receive a reset token.'}
                {view === 'reset' && 'Enter the token from your email and choose a new password.'}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 pb-8 sm:pb-10 px-4 sm:px-6">
            {error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {view !== 'reset' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground/80 ml-0.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
                    <Input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                      className="pl-9 h-10 text-sm rounded-xl border-border/70 bg-muted/20 focus-visible:bg-background transition-all"
                    />
                  </div>
                </div>
              )}

              {view === 'reset' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground/80 ml-0.5">Reset Token</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
                    <Input
                      type="text"
                      value={token}
                      onChange={e => setToken(e.target.value)}
                      required
                      placeholder="Paste your reset token"
                      className="pl-9 h-10 text-sm rounded-xl border-border/70 bg-muted/20 focus-visible:bg-background transition-all"
                    />
                  </div>
                </div>
              )}

              {view !== 'forgot' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-muted-foreground/80 ml-0.5">
                      {view === 'reset' ? 'New Password' : 'Password'}
                    </label>
                    {view === 'login' && (
                      <button
                        type="button"
                        onClick={() => { setView('forgot'); setError(''); setMessage(''); }}
                        className="text-[11px] font-medium text-primary/70 hover:text-primary transition-colors"
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
                    <Input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="••••••••"
                      className="pl-9 h-10 text-sm rounded-xl border-border/70 bg-muted/20 focus-visible:bg-background transition-all"
                    />
                  </div>
                </div>
              )}

              <Button type="submit" size="lg" disabled={isBusy} className="w-full h-10 rounded-xl font-semibold mt-1 shadow-sm hover:shadow-md transition-all">
                {isBusy && <Loader2 size={16} className="animate-spin mr-2" />}
                {view === 'login' && 'Sign in'}
                {view === 'register' && 'Create account'}
                {view === 'forgot' && 'Send reset token'}
                {view === 'reset' && 'Update password'}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/40" />
              </div>
            </div>

            <div className="text-center text-xs">
              {view === 'login' && (
                <button
                  onClick={() => { setView('register'); setError(''); setMessage(''); }}
                  className="font-medium text-primary/80 hover:text-primary transition-colors"
                >
                  Don't have an account? <span className="underline underline-offset-2">Register</span>
                </button>
              )}

              {view === 'register' && (
                <button
                  onClick={() => { setView('login'); setError(''); setMessage(''); }}
                  className="font-medium text-primary/80 hover:text-primary transition-colors"
                >
                  Already registered? <span className="underline underline-offset-2">Sign in</span>
                </button>
              )}

              {(view === 'forgot' || view === 'reset') && (
                <button
                  onClick={() => { setView('login'); setError(''); setMessage(''); }}
                  className="font-medium text-primary/80 hover:text-primary transition-colors"
                >
                  <span className="underline underline-offset-2">Back to sign in</span>
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

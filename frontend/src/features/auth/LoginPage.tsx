import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, Lock, ShieldCheck, KeyRound } from 'lucide-react';
import { API_BASE, extractErrorMessage } from '@/api';

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
        if (data.token) {
          setToken(data.token);
        }
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

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/20">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent pointer-events-none" />
      
      <Card className="w-full max-w-md p-8 glass-card border border-white/5 relative z-10 overflow-hidden shadow-2xl rounded-2xl">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
        
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-indigo-950/40 border border-indigo-500/20 rounded-xl flex items-center justify-center shadow-inner">
            <ShieldCheck className="h-6 w-6 text-indigo-400" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {view === 'login' && 'Sign In'}
            {view === 'register' && 'Create Account'}
            {view === 'forgot' && 'Forgot Password'}
            {view === 'reset' && 'Reset Password'}
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {view === 'login' && 'Enter your credentials to continue'}
            {view === 'register' && 'Register a new account'}
            {view === 'forgot' && 'Request a password reset token'}
            {view === 'reset' && 'Enter reset token and new password'}
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-lg bg-red-950/30 border border-red-800/40 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-lg bg-green-950/30 border border-green-800/40 px-3.5 py-2.5 text-xs text-green-300">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {view !== 'reset' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="pl-10 premium-input border"
                />
              </div>
            </div>
          )}

          {view === 'reset' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reset Token</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  required
                  placeholder="Paste token here"
                  className="pl-10 premium-input border"
                />
              </div>
            </div>
          )}

          {view !== 'forgot' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {view === 'reset' ? 'New Password' : 'Password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="••••••••"
                  className="pl-10 premium-input border"
                />
              </div>
            </div>
          )}

          <Button type="submit" disabled={authLoading || loading} className="mt-2 w-full h-10 font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all duration-150">
            {(authLoading || loading) && <Loader2 size={14} className="mr-2 animate-spin" />}
            {view === 'login' && 'Sign In'}
            {view === 'register' && 'Register'}
            {view === 'forgot' && 'Send Token'}
            {view === 'reset' && 'Reset Password'}
          </Button>
        </form>

        <div className="mt-6 flex flex-col gap-2.5 text-center">
          {view === 'login' && (
            <>
              <button
                onClick={() => { setView('register'); setError(''); setMessage(''); }}
                className="bg-none cursor-pointer border-none text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Don't have an account? Register
              </button>
              <button
                onClick={() => { setView('forgot'); setError(''); setMessage(''); }}
                className="bg-none cursor-pointer border-none text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                Forgot your password?
              </button>
            </>
          )}

          {view === 'register' && (
            <button
              onClick={() => { setView('login'); setError(''); setMessage(''); }}
              className="bg-none cursor-pointer border-none text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Already have an account? Sign in
            </button>
          )}

          {(view === 'forgot' || view === 'reset') && (
            <button
              onClick={() => { setView('login'); setError(''); setMessage(''); }}
              className="bg-none cursor-pointer border-none text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </Card>
    </div>
  );
};

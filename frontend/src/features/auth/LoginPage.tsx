import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, register, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="SSIAR" className="mx-auto mb-2 h-10 w-auto" />
          <h2 className="text-lg font-semibold text-foreground">
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isRegister ? 'Register a new account' : 'Enter your credentials to continue'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-destructive px-3 py-2 text-xs text-destructive-foreground">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Password</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </div>
          <Button type="submit" disabled={loading} className="mt-1">
            {loading && <Loader2 size={14} className="mr-2 animate-spin" />}
            {isRegister ? 'Register' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="bg-none cursor-pointer border-none text-xs text-[var(--accent-violet)] underline"
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>
      </Card>
    </div>
  );
};

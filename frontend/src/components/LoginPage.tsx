import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    }
  };

  return (
    <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Card className="p-8" style={{ width: '380px', maxWidth: '90vw' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img src="/logo.png" alt="SSIAR" className="h-10 w-auto mx-auto" style={{ marginBottom: '8px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {isRegister ? 'Create Account' : 'Sign In'}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {isRegister ? 'Register a new account' : 'Enter your credentials to continue'}
          </p>
        </div>

        {error && (
          <div style={{
            padding: '8px 12px', marginBottom: '16px',
            background: 'var(--accent-rose)', color: '#fff',
            borderRadius: '6px', fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: '6px',
                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                color: 'var(--text-primary)', fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="At least 6 characters"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: '6px',
                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                color: 'var(--text-primary)', fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <Button type="submit" disabled={loading} style={{ marginTop: '4px' }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {isRegister ? 'Register' : 'Sign In'}
          </Button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            style={{
              background: 'none', border: 'none', color: 'var(--accent-violet)',
              fontSize: '13px', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
          </button>
        </div>
      </Card>
    </div>
  );
};

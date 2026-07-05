import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { API_BASE } from '../api';

interface AuthState {
  token: string | null;
  user_id: string | null;
  email: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  token: null, user_id: null, email: null,
  login: async () => {}, register: async () => {}, logout: () => {},
  loading: false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('ssiar_token');
    const user_id = localStorage.getItem('ssiar_user_id');
    const email = localStorage.getItem('ssiar_email');
    return { token, user_id, email };
  });
  const [loading, setLoading] = useState(false);

  const saveState = (token: string, user_id: string, email: string) => {
    localStorage.setItem('ssiar_token', token);
    localStorage.setItem('ssiar_user_id', user_id);
    localStorage.setItem('ssiar_email', email);
    setState({ token, user_id, email });
  };

  const clearState = () => {
    localStorage.removeItem('ssiar_token');
    localStorage.removeItem('ssiar_user_id');
    localStorage.removeItem('ssiar_email');
    setState({ token: null, user_id: null, email: null });
  };

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Login failed');
      }
      const data = await res.json();
      saveState(data.token, data.user_id, data.email);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Registration failed');
      }
      const data = await res.json();
      saveState(data.token, data.user_id, data.email);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearState();
    window.location.href = '/';
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

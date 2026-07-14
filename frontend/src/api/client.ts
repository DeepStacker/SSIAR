export const API_BASE = import.meta.env.VITE_API_BASE || "/api/v3";

const getToken = (): string | null => localStorage.getItem('ssiar_token');

export const isTokenExpired = (): boolean => {
  const token = getToken();
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

const getTokenExpiry = (): number | null => {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000;
  } catch {
    return null;
  }
};

export const clearAuth = () => {
  localStorage.removeItem('ssiar_token');
  localStorage.removeItem('ssiar_user_id');
  localStorage.removeItem('ssiar_email');
};

const REDIRECT_KEY = 'ssiar_login_redirect';

export const saveReferrer = () => {
  const path = window.location.pathname + window.location.search;
  if (path !== '/' && path !== '/login') {
    sessionStorage.setItem(REDIRECT_KEY, path);
  }
};

export const getAndClearReferrer = (): string | null => {
  const path = sessionStorage.getItem(REDIRECT_KEY);
  sessionStorage.removeItem(REDIRECT_KEY);
  return path;
};

export const redirectToLogin = () => {
  clearAuth();
  saveReferrer();
  window.location.href = '/login';
};

// ── V3 response helpers ──

interface V3Success<T = unknown> { success: true; data: T; message: string; meta: Record<string, unknown> }

function isV3Success<T>(body: unknown): body is V3Success<T> {
  return typeof body === 'object' && body !== null && 'success' in body && (body as V3Success).success === true
}

function extractErrorMessage(errBody: Record<string, unknown>): string {
  if (errBody.error && typeof errBody.error === 'object') {
    const e = errBody.error as { message?: string; code?: string }
    if (e.message) return e.message
  }
  if (typeof errBody.detail === 'string') return errBody.detail
  return 'Request failed'
}

function unwrapV3<T>(body: unknown): T {
  if (isV3Success<T>(body)) return body.data
  return body as T
}

// ── Token refresh ──

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export const scheduleTokenRefresh = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  const exp = getTokenExpiry();
  if (!exp) return;
  const now = Date.now();
  const ttl = exp - now;
  if (ttl <= 0) { redirectToLogin(); return; }
  const refreshIn = Math.max(ttl * 0.8, 60000);
  refreshTimer = setTimeout(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) { redirectToLogin(); return; }
      const body = await res.json();
      const data = unwrapV3<{ token: string; user_id: string; email: string }>(body);
      localStorage.setItem('ssiar_token', data.token);
      localStorage.setItem('ssiar_user_id', data.user_id);
      localStorage.setItem('ssiar_email', data.email);
      scheduleTokenRefresh();
    } catch {
      redirectToLogin();
    }
  }, refreshIn);
};

export const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { "Authorization": `Bearer ${token}` } : {};
};

// ── Simple TTL cache for GET requests ──
interface CacheEntry { data: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const DEFAULT_TTL = 30_000

const getTtl = (url: string) => {
  if (url.includes('/queue-status')) return 3_000
  if (url.includes('/documents/')) return 3_000
  if (url.includes('/review/tasks')) return 5_000
  return DEFAULT_TTL
}

const fetchJson = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const key = url
  const entry = cache.get(key)
  if (entry && entry.expiresAt > Date.now() && (!options || options.method === undefined || options.method === 'GET')) {
    return entry.data as T
  }
  const headers: Record<string, string> = { ...authHeaders(), ...(options?.headers as Record<string, string> || {}) }
  const response = await fetch(url, { ...options, headers })
  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Session expired');
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(extractErrorMessage(err))
  }
  const body = await response.json()
  const data = unwrapV3<T>(body)
  if (!options || options.method === undefined || options.method === 'GET') {
    cache.set(key, { data, expiresAt: Date.now() + getTtl(url) })
  }
  return data
}

export const clearApiCache = () => cache.clear()

export const invalidateCache = (keyStartsWith: string): void => {
  for (const key of cache.keys()) {
    if (key.includes(keyStartsWith)) {
      cache.delete(key);
    }
  }
}

export const invalidateCachePrefix = (prefix: string) => {
  for (const key of cache.keys()) {
    if (key.includes(prefix)) {
      cache.delete(key);
    }
  }
}

export { fetchJson, unwrapV3, extractErrorMessage }

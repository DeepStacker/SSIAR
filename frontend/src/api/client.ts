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

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export const scheduleTokenRefresh = () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  const exp = getTokenExpiry();
  if (!exp) return;
  const now = Date.now();
  const ttl = exp - now;
  if (ttl <= 0) { clearAuth(); window.location.href = '/'; return; }
  const refreshIn = Math.max(ttl * 0.8, 60000);
  refreshTimer = setTimeout(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) { clearAuth(); window.location.href = '/'; return; }
      const data = await res.json();
      localStorage.setItem('ssiar_token', data.token);
      localStorage.setItem('ssiar_user_id', data.user_id);
      localStorage.setItem('ssiar_email', data.email);
      scheduleTokenRefresh();
    } catch {
      clearAuth(); window.location.href = '/';
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
    clearAuth();
    window.location.href = '/';
    throw new Error('Session expired');
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.detail || `Request failed: ${response.status}`)
  }
  const data = await response.json()
  if (!options || options.method === undefined || options.method === 'GET') {
    cache.set(key, { data, expiresAt: Date.now() + getTtl(url) })
  }
  return data as T
}

export const clearApiCache = () => cache.clear()
export { fetchJson }

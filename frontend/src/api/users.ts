import { API_BASE, authHeaders, extractErrorMessage, unwrapV3 } from './client';

interface UserItem {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

export const usersApi = {
  listUsers: async (): Promise<{ users: UserItem[] }> => {
    const res = await fetch(`${API_BASE}/auth/users`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ users: UserItem[] }>(await res.json());
  },

  createUser: async (email: string, password: string): Promise<{ user_id: string; email: string; role: string; message: string }> => {
    const res = await fetch(`${API_BASE}/auth/users`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ user_id: string; email: string; role: string; message: string }>(await res.json());
  },

  updateUserEmail: async (userId: string, email: string): Promise<{ message: string }> => {
    const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ message: string }>(await res.json());
  },

  updateUserRole: async (userId: string, role: string): Promise<{ message: string }> => {
    const res = await fetch(`${API_BASE}/auth/users/${userId}/role`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ message: string }>(await res.json());
  },

  resetUserPassword: async (userId: string, newPassword: string): Promise<{ message: string }> => {
    const res = await fetch(`${API_BASE}/auth/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ message: string }>(await res.json());
  },

  deleteUser: async (userId: string): Promise<{ message: string }> => {
    const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ message: string }>(await res.json());
  },
};

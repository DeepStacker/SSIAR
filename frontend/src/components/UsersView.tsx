import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { API_BASE, extractErrorMessage } from '@/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Shield, Trash2, Users } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface UserItem {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

export const UsersView: React.FC = () => {
  const { token, user_id: currentUserId } = useAuth();
  const { show: showToast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(extractErrorMessage(err) || 'Failed to fetch users');
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to fetch users', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleUpdateRole = async (targetId: string, newRole: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/users/${targetId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data) || 'Failed to update user role');
      showToast('User role updated successfully', 'success');
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update role', 'error');
    }
  };

  const handleDeleteUser = async (targetId: string) => {
    if (targetId === currentUserId) {
      showToast('Self-deletion not allowed', 'error');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`${API_BASE}/auth/users/${targetId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(data) || 'Failed to delete user');
      showToast('User deleted successfully', 'success');
      fetchUsers();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete user', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="animate-spin text-indigo-400" size={24} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto animate-chart-enter">
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Users size={18} className="text-indigo-400" />
            User Access Management
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Configure system permissions, promote team roles, and manage active researcher access credentials.
          </p>
        </div>
      </div>

      <Card className="glass-card overflow-hidden rounded-2xl shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/40 text-muted-foreground font-semibold bg-slate-950/20 uppercase tracking-wider text-[10px]">
                <th className="py-3 px-6">Email Address</th>
                <th className="py-3 px-4 w-28">User Role</th>
                <th className="py-3 px-4 w-32">Created Date</th>
                <th className="py-3 px-6 w-36 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.user_id} className="border-b border-border/20 last:border-none hover:bg-accent/10 transition-colors">
                  <td className="py-3 px-6 font-semibold text-foreground">{u.email}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      u.role === 'admin' 
                        ? 'bg-indigo-950/40 text-indigo-400 border-indigo-500/20' 
                        : 'bg-slate-900/40 text-muted-foreground border-border/40'
                    }`}>
                      <Shield size={10} />
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="py-3 px-6 text-right space-x-1.5" onClick={e => e.stopPropagation()}>
                    {u.user_id !== currentUserId ? (
                      <>
                        {u.role === 'admin' ? (
                          <Button
                            variant="outline"
                            size="xs"
                            className="h-7 text-[10px] font-bold border-white/5 bg-slate-900/50 hover:bg-slate-900"
                            onClick={() => handleUpdateRole(u.user_id, 'user')}
                            title="Demote to standard user"
                          >
                            Demote
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="xs"
                            className="h-7 text-[10px] font-bold border-indigo-500/30 text-indigo-400 bg-indigo-950/20 hover:bg-indigo-950"
                            onClick={() => handleUpdateRole(u.user_id, 'admin')}
                            title="Promote to administrator"
                          >
                            Promote
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-rose-400 hover:text-rose-500 hover:bg-rose-950/20"
                          onClick={() => handleDeleteUser(u.user_id)}
                          title="Delete User"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </>
                    ) : (
                      <span className="text-[10px] text-indigo-400 font-bold bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-500/20">You (Owner)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

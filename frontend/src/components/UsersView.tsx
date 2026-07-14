import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usersApi } from '@/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Shield, Trash2, Users, Plus, Pencil, KeyRound, AlertTriangle } from 'lucide-react';
import { useToast } from '@/context/ToastContext';

interface UserItem {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

export const UsersView: React.FC = () => {
  const { user_id: currentUserId } = useAuth();
  const { show: showToast } = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await usersApi.listUsers();
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (currentUserId && selectedIds.has(currentUserId)) {
      showToast('Self-deletion not allowed', 'error'); return;
    }
    if (!window.confirm(`Delete ${selectedIds.size} selected user(s)?`)) return;
    setBulkDeleting(true);
    let failed = 0;
    for (const id of selectedIds) {
      try { await usersApi.deleteUser(id); } catch { failed++; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    if (failed) showToast(`${failed} deletion(s) failed`, 'error');
    fetchUsers();
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleSelectAll = () => {
    const eligible = users.filter(u => u.user_id !== currentUserId);
    if (selectedIds.size === eligible.length && eligible.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(eligible.map(u => u.user_id)));
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[200px] sm:h-64">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted">
            <Users size={16} className="text-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Users</h2>
            <p className="text-xs text-muted-foreground">{users.length} total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete ({selectedIds.size})
            </Button>
          )}
          <AddUserDialog onCreated={fetchUsers} />
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle size={16} />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={fetchUsers}>Retry</Button>
        </div>
      )}

      {!error && users.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted mb-4">
            <Users size={24} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No users yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create the first user to get started.</p>
        </div>
      )}

      {users.length > 0 && (
        <div className="flex-1 overflow-auto px-6 py-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && users.filter(u => u.user_id !== currentUserId).every(u => selectedIds.has(u.user_id))}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-28">Role</TableHead>
                  <TableHead className="w-40">Created</TableHead>
                  <TableHead className="w-44 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.user_id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u.user_id)}
                        onChange={() => toggleSelect(u.user_id)}
                        disabled={u.user_id === currentUserId}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{u.email}</span>
                        {u.user_id === currentUserId && (
                          <Badge variant="secondary" className="text-[10px]">You</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                        <Shield size={10} className="mr-1" />
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.user_id !== currentUserId ? (
                        <div className="flex items-center justify-end gap-1">
                          <EditEmailDialog userId={u.user_id} currentEmail={u.email} onUpdated={fetchUsers} />
                          {u.role === 'admin' ? (
                            <Button variant="outline" size="xs" onClick={() => handleRole(u.user_id, 'user')}>Demote</Button>
                          ) : (
                            <Button variant="outline" size="xs" onClick={() => handleRole(u.user_id, 'admin')}>Promote</Button>
                          )}
                          <ResetPasswordDialog userId={u.user_id} onReset={fetchUsers} />
                          <DeleteUserDialog userId={u.user_id} userEmail={u.email} onDeleted={() => handleDelete(u.user_id)} />
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );

  function handleRole(targetId: string, newRole: string) {
    usersApi.updateUserRole(targetId, newRole).then(fetchUsers).catch(e => showToast(e.message, 'error'));
  }
  function handleDelete(targetId: string) {
    usersApi.deleteUser(targetId).then(() => { showToast('User deleted', 'success'); fetchUsers(); }).catch(e => showToast(e.message, 'error'));
  }
};

function AddUserDialog({ onCreated }: { onCreated: () => void }) {
  const { show: showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!email.includes('@')) { showToast('Valid email required', 'error'); return; }
    if (password.length < 8) { showToast('Min 8 characters', 'error'); return; }
    setSaving(true);
    try {
      await usersApi.createUser(email, password);
      showToast('User created', 'success');
      setOpen(false); setEmail(''); setPassword('');
      onCreated();
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} className="mr-1.5" /> Add User
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>Add a new system user.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Email</label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" type="email" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Password</label>
            <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" type="password" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            Create User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEmailDialog({ userId, currentEmail, onUpdated }: { userId: string; currentEmail: string; onUpdated: () => void }) {
  const { show: showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!email.includes('@')) { showToast('Valid email required', 'error'); return; }
    setSaving(true);
    try { await usersApi.updateUserEmail(userId, email); showToast('Email updated', 'success'); setOpen(false); onUpdated(); }
    catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (o) setEmail(currentEmail); }}>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} title="Edit email" className="hover:text-foreground"><Pencil size={13} /></Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Email</DialogTitle><DialogDescription>Change the email for this user.</DialogDescription></DialogHeader>
        <Input value={email} onChange={e => setEmail(e.target.value)} />
        <DialogFooter><Button onClick={save} disabled={saving}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ userId, onReset }: { userId: string; onReset: () => void }) {
  const { show: showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = async () => {
    if (password.length < 8) { showToast('Min 8 characters', 'error'); return; }
    setSaving(true);
    try { await usersApi.resetUserPassword(userId, password); showToast('Password reset', 'success'); setOpen(false); setPassword(''); onReset(); }
    catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setPassword(''); }}>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} title="Reset password" className="text-muted-foreground hover:text-foreground"><KeyRound size={13} /></Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset Password</DialogTitle><DialogDescription>Set a new password for this user.</DialogDescription></DialogHeader>
        <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" type="password" />
        <DialogFooter><Button onClick={reset} disabled={saving}>{saving && <Loader2 size={14} className="mr-1.5 animate-spin" />}Reset</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({ userId, userEmail, onDeleted }: { userId: string; userEmail: string; onDeleted: () => void }) {
  const { show: showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const del = async () => {
    setDeleting(true);
    try { await usersApi.deleteUser(userId); showToast('User deleted', 'success'); setOpen(false); onDeleted(); }
    catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setDeleting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} title="Delete" className="text-muted-foreground hover:text-destructive"><Trash2 size={13} /></Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
          <DialogDescription>Permanently delete <strong>{userEmail}</strong>?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" onClick={del} disabled={deleting}>{deleting && <Loader2 size={14} className="mr-1.5 animate-spin" />}Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

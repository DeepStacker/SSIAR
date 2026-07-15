import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, MessageSquare, Plus, Paperclip, X, Send,
  Clock, AlertTriangle, CheckCircle, XCircle,
  Filter, Image as ImageIcon, Paperclip as PaperclipIcon,
  FileSpreadsheet, File as FileIcon,
  ChevronRight, Reply, User,
  ShieldCheck, Lock, Download,
} from 'lucide-react';
import { api } from '@/api';
import type { FeedbackItem, FeedbackMessage } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  open: { label: 'Open', variant: 'destructive', icon: <AlertTriangle size={11} /> },
  in_progress: { label: 'In Progress', variant: 'default', icon: <Clock size={11} /> },
  resolved: { label: 'Resolved', variant: 'secondary', icon: <CheckCircle size={11} /> },
  closed: { label: 'Closed', variant: 'outline', icon: <XCircle size={11} /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return <Badge variant={cfg.variant} className="gap-1 text-[10px] px-2 py-0 h-5">{cfg.icon}{cfg.label}</Badge>;
}

function fileIcon(type: string | null) {
  if (!type) return <FileIcon size={14} />;
  if (type.startsWith('image/')) return <ImageIcon size={14} />;
  if (type === 'application/pdf') return <PdfBadge />;
  if (type.includes('sheet') || type.includes('excel') || type === 'text/csv') return <FileSpreadsheet size={14} />;
  return <FileIcon size={14} />;
}

function PdfBadge() {
  return <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-primary text-[10px] font-bold">PDF</span>;
}

function AttachmentPreview({ path, type }: { path: string; type: string | null }) {
  const url = api.attachmentUrl(path);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const filename = path.split('/').pop() || path;

  if (!url) return null;

  if (type?.startsWith('image/')) {
    return (
      <div className="relative rounded-lg overflow-hidden border border-border bg-muted/10 group">
        {!loaded && !error && (
          <div className="flex items-center justify-center h-36"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
        )}
        {error && <div className="flex items-center justify-center h-36 text-xs text-muted-foreground">Failed to load</div>}
        <img src={url} alt="" className={`w-full max-h-72 object-contain bg-muted/5 ${loaded ? 'block' : 'hidden'}`}
          onLoad={() => setLoaded(true)} onError={() => setError(true)} />
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="absolute bottom-1.5 right-1.5 h-7 w-7 rounded-lg bg-background/90 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-border">
          <Download size={13} />
        </a>
      </div>
    );
  }

  if (type === 'application/pdf') {
    return (
      <div className="rounded-lg overflow-hidden border border-border">
        <iframe src={url} className="w-full h-72" title="PDF" />
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-muted/10 hover:bg-muted/30 transition-colors text-xs">
      {fileIcon(type)}
      <span className="text-foreground/80 truncate max-w-[200px]">{filename}</span>
      <Download size={12} className="text-muted-foreground ml-auto shrink-0" />
    </a>
  );
}

function MessageBubble({ msg, isOwn }: { msg: FeedbackMessage; isOwn: boolean }) {
  return (
    <div className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold mt-1 ${
        isOwn ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
      }`}>
        {isOwn ? <ShieldCheck size={13} /> : <User size={13} />}
      </div>
      <div className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
        <div className={`px-3.5 py-2 text-xs leading-relaxed ${
          isOwn
            ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-md'
            : 'bg-muted/80 rounded-2xl rounded-tl-md'
        }`}>
          <div className="whitespace-pre-wrap break-words">{msg.message}</div>
          {msg.attachment_path && (
            <div className={`mt-2 ${isOwn ? 'text-primary-foreground/90' : ''}`}>
              <AttachmentPreview path={msg.attachment_path} type={msg.attachment_type} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-muted-foreground">
          <span className="font-medium">{isOwn ? 'You' : msg.user_email?.split('@')[0] || 'User'}</span>
          <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
}

const currentUserId = () => localStorage.getItem('ssiar_user_id') || '';

export const FeedbackView: React.FC = () => {
  const { role } = useAuth();
  const { show: toast } = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatAttachment, setChatAttachment] = useState<File | null>(null);
  const [chatSending, setChatSending] = useState(false);
  const isClosed = selectedItem?.status === 'closed';

  const loadMessages = useCallback(async (id: number) => {
    try { const d = await api.getMessages(id); setMessages(d.messages); } catch (e) { console.error('Failed to load messages', e); }
  }, []);

  useEffect(() => {
    if (selectedId !== null) {
      setMessagesLoading(true);
      loadMessages(selectedId).finally(() => setMessagesLoading(false));
    }
  }, [selectedId, loadMessages]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.feedback_id === selectedId && selectedId !== null) loadMessages(selectedId);
    };
    const statusHandler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.feedback_id === selectedId) setSelectedItem(p => p ? { ...p, status: d.status } : p);
    };
    window.addEventListener('feedback_message', handler);
    window.addEventListener('feedback_status', statusHandler);
    return () => { window.removeEventListener('feedback_message', handler); window.removeEventListener('feedback_status', statusHandler); };
  }, [selectedId, loadMessages]);

  const sendMessage = async () => {
    if (!selectedId || !chatInput.trim()) return;
    setChatSending(true);
    try {
      await api.addMessage(selectedId, chatInput.trim(), chatAttachment || undefined);
      setChatInput('');
      setChatAttachment(null);
      await loadMessages(selectedId);
    } catch (e: any) { toast('Failed: ' + e.message, 'error'); } finally { setChatSending(false); }
  };

  const ChatInput = () => (
    <div className="p-3 border-t border-border bg-background/95">
      {chatAttachment && (
        <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg bg-muted/30 text-[11px] text-muted-foreground">
          <PaperclipIcon size={11} />
          <span className="truncate flex-1">{chatAttachment.name}</span>
          <button onClick={() => { setChatAttachment(null); }} className="text-destructive/70 hover:text-destructive ml-auto"><X size={12} /></button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <Textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={isClosed ? 'Closed' : 'Write a reply...'}
            className="min-h-[38px] max-h-[120px] text-xs resize-none rounded-xl bg-muted/20 border-muted/60 pr-9"
            rows={1} disabled={isClosed} />
          <label className={`absolute right-1.5 bottom-1.5 h-7 w-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
            isClosed ? 'opacity-30 cursor-not-allowed' : 'hover:bg-muted'
          }`}>
            <input type="file" accept="image/*,.pdf,.xlsx,.xls,.csv,.txt" className="hidden"
              onChange={e => setChatAttachment(e.target.files?.[0] || null)} disabled={isClosed} />
            <Paperclip size={13} className="text-muted-foreground" />
          </label>
        </div>
        <Button size="icon" className="h-[38px] w-[38px] rounded-xl shrink-0" onClick={sendMessage}
          disabled={chatSending || !chatInput.trim() || isClosed}>
          {chatSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </Button>
      </div>
    </div>
  );

  if (role === 'admin') return <AdminView {...{ selectedId, setSelectedId, selectedItem, setSelectedItem, messages, messagesLoading, isClosed, chatEndRef, ChatInput, sendMessage, toast }} />;
  return <UserView {...{ selectedId, setSelectedId, selectedItem, setSelectedItem, messages, messagesLoading, isClosed, chatEndRef, chatInput, setChatInput, chatAttachment, setChatAttachment, chatSending, sendMessage }} />;
};

// ── Admin split-pane ──
function AdminView({ selectedId, setSelectedId, selectedItem, setSelectedItem, messages, messagesLoading, isClosed, chatEndRef, ChatInput, toast }: any) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.listFeedback({ status: statusFilter || undefined, limit: 100 });
      setItems(d.items); setTotal(d.total);
    } catch (e: any) { toast('Failed: ' + e.message, 'error'); } finally { setLoading(false); }
  }, [statusFilter, toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('feedback_created', h);
    window.addEventListener('feedback_status', h);
    return () => { window.removeEventListener('feedback_created', h); window.removeEventListener('feedback_status', h); };
  }, [load]);

  return (
    <div className="flex flex-col lg:flex-row overflow-hidden" style={{ height: 'calc(100vh - 56px)' }}>
      <div className="w-full lg:w-[320px] shrink-0 lg:border-r border-b lg:border-b-0 border-border flex flex-col bg-muted/3 max-h-[40vh] lg:max-h-none">
        <div className="p-3 border-b border-border/60 bg-background space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary/10 p-1.5"><MessageSquare size={15} className="text-primary" /></div>
            <div><h1 className="text-sm font-semibold tracking-tight">Feedback</h1><p className="text-[11px] text-muted-foreground/60">{total} submission{total !== 1 ? 's' : ''}</p></div>
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v || ''); setSelectedId(null); setSelectedItem(null); }}>
            <SelectTrigger className="h-7 text-xs"><Filter size={12} className="mr-1.5 text-muted-foreground" /><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={15} className="animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-1"><MessageSquare size={20} className="opacity-[0.15]" /><p className="text-xs text-muted-foreground/50">No submissions</p></div>
          ) : (
            <div>
              {items.map(item => (
                <button key={item.id} onClick={() => { setSelectedId(item.id); setSelectedItem(item); }}
                  className={`w-full text-left p-2.5 border-b border-border/20 transition-all hover:bg-muted/15 ${
                    selectedId === item.id ? 'bg-muted/30' : ''
                  }`}>
                  <div className="flex gap-2">
                    <div className={`shrink-0 w-1 rounded-full mt-1.5 ${
                      item.status === 'open' ? 'bg-red-400' :
                      item.status === 'in_progress' ? 'bg-blue-400' :
                      item.status === 'resolved' ? 'bg-green-400' : 'bg-gray-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-medium truncate">{item.subject}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 line-clamp-2 leading-relaxed">{item.message}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <StatusBadge status={item.status} />
                        <span className="text-[10px] text-muted-foreground/40">{item.user_email?.split('@')[0] || '?'}</span>
                        {item.attachment_path && <Paperclip size={8} className="text-muted-foreground/30" />}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/30 shrink-0 mt-0.5">{new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {selectedItem ? (
          <>
            <div className="shrink-0 border-b border-border/50 bg-background">
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold tracking-tight truncate">{selectedItem.subject}</h2>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground/50">
                      <span className="font-medium">{selectedItem.user_email}</span>
                      <span>·</span>
                      <span>{new Date(selectedItem.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <Select value={selectedItem.status} onValueChange={async v => {
                    if (!v) return;
                    try { await api.updateFeedbackStatus(selectedItem.id, v); toast('Status updated', 'success'); load(); setSelectedItem((p: FeedbackItem | null) => p ? { ...p, status: v } : p); } catch (e: any) { toast('Failed: ' + e.message, 'error'); }
                  }}>
                    <SelectTrigger className="h-6 w-[95px] text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-xs text-foreground/65 whitespace-pre-wrap leading-relaxed bg-muted/8 rounded-lg px-3 py-2.5 border border-border/20">{selectedItem.message}</div>
                {selectedItem.attachment_path && <div className="mt-2"><AttachmentPreview path={selectedItem.attachment_path} type={selectedItem.attachment_type} /></div>}
                {isClosed && <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/40"><Lock size={10} /> Closed</div>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2.5 space-y-2.5 bg-muted/[0.02]">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 size={15} className="animate-spin text-muted-foreground" /></div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-1"><Reply size={18} className="opacity-[0.12]" /><p className="text-xs text-muted-foreground/40">No messages yet</p></div>
              ) : (
                messages.map((msg: FeedbackMessage) => <MessageBubble key={msg.id} msg={msg} isOwn={msg.user_id === currentUserId()} />)
              )}
              <div ref={chatEndRef} />
            </div>

            <ChatInput />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center">
              <MessageSquare size={24} className="opacity-40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground/50 tracking-tight">Select a submission</p>
            <p className="text-xs text-muted-foreground/30">Choose from the list to view and respond</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── User view ──
function UserView({ selectedId, setSelectedId, selectedItem, setSelectedItem, messages, messagesLoading, isClosed, chatEndRef, chatInput, setChatInput, chatAttachment, setChatAttachment, chatSending, sendMessage }: any) {
  const { show: toast } = useToast();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api.listFeedback({ limit: 100 }); setItems(d.items); } catch (e) { console.error('Failed to load feedback', e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener('feedback_created', h); window.addEventListener('feedback_status', h);
    return () => { window.removeEventListener('feedback_created', h); window.removeEventListener('feedback_status', h); };
  }, [load]);

  const submit = async () => {
    if (!subject.trim() || !message.trim()) { toast('Subject and message required', 'error'); return; }
    setSubmitting(true);
    try {
      await api.createFeedback(subject.trim(), message.trim(), attachment || undefined);
      toast('Submitted!', 'success');
      setSubject(''); setMessage(''); setAttachment(null);
      load();
    } catch (e: any) { toast(e.message, 'error'); } finally { setSubmitting(false); }
  };

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 h-full overflow-y-auto max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-2.5">
        <div className="rounded-lg bg-primary/10 p-2"><MessageSquare size={18} className="text-primary" /></div>
        <div><h1 className="text-base font-semibold">Feedback</h1><p className="text-xs text-muted-foreground">Report issues or suggest improvements</p></div>
      </div>

      <Card className="shadow-xs">
        <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Plus size={14} />New Report</CardTitle></CardHeader>
        <CardContent className="space-y-2.5">
          <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} className="text-sm" />
          <Textarea placeholder="Describe the issue..." value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={2000} />
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              <input type="file" accept="image/*,.pdf,.xlsx,.xls,.csv,.txt" className="hidden" onChange={e => setAttachment(e.target.files?.[0] || null)} />
              <Paperclip size={13} />
              {attachment ? <span className="text-foreground/80 truncate max-w-[180px]">{attachment.name}</span> : 'Attach file'}
            </label>
            {attachment && <button onClick={() => setAttachment(null)} className="text-destructive/70 hover:text-destructive"><X size={12} /></button>}
            <Button size="sm" className="ml-auto" onClick={submit} disabled={submitting || !subject.trim() || !message.trim()}>
              {submitting ? <Loader2 size={13} className="animate-spin mr-1" /> : <Send size={13} className="mr-1" />}Send
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        <h2 className="text-xs font-medium text-muted-foreground px-1">Your Submissions</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground gap-1"><MessageSquare size={22} className="opacity-30" /><p className="text-xs">No submissions yet</p></div>
        ) : (
          <div className="space-y-1">
            {items.map(item => (
              <button key={item.id} onClick={() => { setSelectedId(item.id); setSelectedItem(item); }}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedId === item.id ? 'border-primary/30 bg-primary/5' : 'border-border/50 hover:bg-muted/30'
                }`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5"><span className="text-sm font-medium truncate">{item.subject}</span><StatusBadge status={item.status} /></div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{item.message}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                      {item.attachment_path && <Paperclip size={9} />}
                    </div>
                  </div>
                  <ChevronRight size={14} className="shrink-0 mt-1 text-muted-foreground/40" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <Card className="shadow-xs border-primary/10">
          <CardHeader className="py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><MessageSquare size={14} />{selectedItem.subject}{isClosed && <Lock size={11} className="text-muted-foreground/60" />}</CardTitle>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setSelectedId(null); setSelectedItem(null); }}><X size={14} /></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="max-h-64 overflow-y-auto min-h-0 space-y-2 px-0.5">
              {messagesLoading ? (
                <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center py-4 text-muted-foreground"><Reply size={18} className="opacity-30 mb-1" /><p className="text-xs">No replies</p></div>
              ) : (
                messages.map((msg: FeedbackMessage) => <MessageBubble key={msg.id} msg={msg} isOwn={msg.user_id === currentUserId()} />)
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="pt-3 border-t border-border">
              {chatAttachment && (
                <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded bg-muted/30 text-[10px] text-muted-foreground">
                  <PaperclipIcon size={10} /><span className="truncate flex-1 max-w-[160px]">{chatAttachment.name}</span>
                  <button onClick={() => setChatAttachment(null)} className="text-destructive/70"><X size={10} /></button>
                </div>
              )}
              <div className="flex items-end gap-1.5">
                <div className="flex-1 relative">
                  <Textarea value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder={isClosed ? 'Closed' : 'Reply...'} className="min-h-[34px] text-xs resize-none rounded-xl bg-muted/15 pr-8" rows={1} disabled={isClosed} />
                  <label className={`absolute right-1 bottom-1 h-6 w-6 rounded flex items-center justify-center cursor-pointer ${isClosed ? 'opacity-30' : 'hover:bg-muted'}`}>
                    <input type="file" accept="image/*,.pdf,.xlsx,.xls,.csv,.txt" className="hidden" onChange={e => setChatAttachment(e.target.files?.[0] || null)} disabled={isClosed} />
                    <Paperclip size={11} className="text-muted-foreground" />
                  </label>
                </div>
                <Button size="icon" className="h-[34px] w-[34px] rounded-xl shrink-0" onClick={sendMessage} disabled={chatSending || !chatInput.trim() || isClosed}>
                  {chatSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

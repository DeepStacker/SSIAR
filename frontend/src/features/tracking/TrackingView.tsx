import { useEffect, useState, useCallback } from 'react';
import { trackingApi } from '@/api/tracking';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw,
  Search, RotateCcw, TrendingUp, Layers, BarChart3, Users, FileText,
  ArrowDown,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import type { TrackingSummary, DlqEntry, TrackingIssue, DocumentStats } from '@/api/types';

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  error: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const issueTypeLabels: Record<string, string> = {
  low_confidence: 'Low Confidence',
  validation_error: 'Validation Error',
  unanswered: 'Unanswered',
  multi_tick: 'Multi-Tick',
  pipeline_error: 'Pipeline Error',
};

const statusLabels: Record<string, string> = {
  uploaded: 'Uploaded', processing: 'Processing', azure_completed: 'Azure Done',
  validation_completed: 'Validated', needs_review: 'Needs Review',
  review_required: 'Review Required', verified: 'Verified', approved: 'Approved',
  failed: 'Failed',
};

const funnelColors: Record<string, string> = {
  uploaded: '#94a3b8', processing: '#f59e0b', azure_completed: '#3b82f6',
  validation_completed: '#8b5cf6', needs_review: '#f97316',
  review_required: '#ef4444', verified: '#10b981', approved: '#22c55e',
  failed: '#dc2626',
};

// ── Small helpers ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <Card size="sm" className="relative overflow-hidden">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-xl font-bold mt-0.5">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniBar({ items, colorFn }: { items: { label: string; value: number }[]; colorFn: (label: string) => string }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div className="flex h-6 rounded-full overflow-hidden gap-px">
      {items.map(i => (
        <div key={i.label} className="relative group flex-1" style={{ width: `${(i.value / total) * 100}%`, minWidth: i.value > 0 ? 4 : 0 }}>
          <div className="h-full rounded-sm transition-all" style={{ backgroundColor: colorFn(i.label) }} title={`${i.label}: ${i.value}`} />
        </div>
      ))}
    </div>
  );
}

// ── SummaryCards ────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: TrackingSummary | null }) {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      <StatCard label="Total Docs" value={summary.total_documents} color="var(--accent-violet)" icon={FileText} sub={`${summary.by_status?.approved || 0} approved`} />
      <StatCard label="Total Issues" value={summary.total_issues} color="var(--accent-rose)" icon={AlertTriangle} sub={`${summary.resolved_issues} resolved`} />
      <StatCard label="Resolution Rate" value={`${Math.round(summary.resolution_rate * 100)}%`} color="var(--accent-emerald)" icon={CheckCircle} />
      <StatCard label="Total Fixes" value={summary.total_fixes} color="var(--accent-cyan)" icon={RotateCcw} />
      <StatCard label="Total Retries" value={summary.total_retries} color="var(--accent-amber)" icon={RefreshCw} />
      <StatCard label="Retried Docs" value={summary.documents_with_retries} color="var(--accent-orange)" icon={Activity} />
    </div>
  );
}

// ── Issue Charts ───────────────────────────────────────────────────────────

function IssuesByTypeChart({ summary }: { summary: TrackingSummary | null }) {
  if (!summary?.issues_by_type?.length) return null;
  const total = summary.issues_by_type.reduce((s, t) => s + t.cnt, 0);
  return (
    <Card size="sm">
      <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Issues by Type</CardTitle></CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col gap-1.5">
          {summary.issues_by_type.map(t => (
            <div key={t.issue_type} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-24 truncate">{issueTypeLabels[t.issue_type] || t.issue_type}</span>
              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(t.cnt / total) * 100}%`, backgroundColor: 'var(--accent-rose)' }} />
              </div>
              <span className="text-[11px] font-medium w-6 text-right">{t.cnt}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function IssuesBySeverityChart({ summary }: { summary: TrackingSummary | null }) {
  if (!summary?.issues_by_severity?.length) return null;
  const total = summary.issues_by_severity.reduce((s, t) => s + t.cnt, 0);
  return (
    <Card size="sm">
      <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Issues by Severity</CardTitle></CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col gap-1.5">
          {summary.issues_by_severity.map(t => (
            <div key={t.severity} className="flex items-center gap-2">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 w-16 justify-center ${severityColors[t.severity] || ''}`}>{t.severity}</Badge>
              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(t.cnt / total) * 100}%`, backgroundColor: t.severity === 'critical' ? 'var(--accent-rose)' : t.severity === 'error' ? 'var(--accent-amber)' : 'var(--accent-cyan)' }} />
              </div>
              <span className="text-[11px] font-medium w-6 text-right">{t.cnt}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Issues Table ───────────────────────────────────────────────────────────

function IssuesTable({
  issues, loading, total, onResolve, filters, onFilterChange,
}: {
  issues: TrackingIssue[]; loading: boolean; total: number;
  onResolve: (issue: TrackingIssue) => void;
  filters: { severity: string; issue_type: string; resolved: string };
  onFilterChange: (f: typeof filters) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={filters.severity} onChange={e => onFilterChange({ ...filters, severity: e.target.value })} className="h-8 text-xs rounded-md border border-input bg-background px-2.5">
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select value={filters.issue_type} onChange={e => onFilterChange({ ...filters, issue_type: e.target.value })} className="h-8 text-xs rounded-md border border-input bg-background px-2.5">
          <option value="">All Types</option>
          {Object.entries(issueTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.resolved} onChange={e => onFilterChange({ ...filters, resolved: e.target.value })} className="h-8 text-xs rounded-md border border-input bg-background px-2.5">
          <option value="">All Status</option>
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{total} issue{total !== 1 ? 's' : ''}</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
      ) : issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <CheckCircle size={32} className="opacity-30" /><p className="text-sm font-medium">No issues found</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead><TableHead>Doc</TableHead><TableHead>Field</TableHead><TableHead>Type</TableHead>
                <TableHead>Severity</TableHead><TableHead>Description</TableHead><TableHead>Created</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map(issue => (
                <TableRow key={issue.id}>
                  <TableCell className="text-xs font-mono">{issue.id}</TableCell>
                  <TableCell className="text-xs font-mono max-w-[80px] truncate" title={issue.document_id}>{issue.document_id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-xs">{issue.field_name || '—'}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{issueTypeLabels[issue.issue_type] || issue.issue_type}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${severityColors[issue.severity] || ''}`}>{issue.severity}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{issue.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(issue.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {issue.resolved_at ? <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">Resolved</Badge>
                      : <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">Open</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {!issue.resolved_at && <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onResolve(issue)}>Resolve</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── DLQ Section ────────────────────────────────────────────────────────────

function DlqSection({ entries, loading, onRetry }: { entries: DlqEntry[]; loading: boolean; onRetry: (docId: string) => void }) {
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const handleRetry = async (docId: string) => {
    setRetrying(p => new Set(p).add(docId));
    await onRetry(docId);
    setRetrying(p => { const n = new Set(p); n.delete(docId); return n; });
  };
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;
  if (entries.length === 0) return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
      <CheckCircle size={32} className="opacity-30" /><p className="text-sm font-medium">No failed documents in DLQ</p>
      <p className="text-xs">All documents processed successfully.</p>
    </div>
  );
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Doc ID</TableHead><TableHead>Filename</TableHead><TableHead>Retries</TableHead><TableHead>Issues</TableHead>
            <TableHead>Error</TableHead><TableHead>Last Error</TableHead><TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(entry => (
            <TableRow key={entry.document_id}>
              <TableCell className="text-xs font-mono max-w-[80px] truncate">{entry.document_id.slice(0, 8)}...</TableCell>
              <TableCell className="text-xs max-w-[150px] truncate">{entry.filename || '—'}</TableCell>
              <TableCell className="text-xs">{entry.retry_count}</TableCell>
              <TableCell className="text-xs">{entry.issue_count}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate text-destructive">{entry.error_message || '—'}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{entry.last_error_at ? new Date(entry.last_error_at).toLocaleDateString() : '—'}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRetry(entry.document_id)} disabled={retrying.has(entry.document_id)}>
                  {retrying.has(entry.document_id) ? <Loader2 size={12} className="animate-spin mr-1" /> : <RefreshCw size={12} className="mr-1" />}
                  Retry
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Pipeline Funnel ────────────────────────────────────────────────────────

function FunnelSection() {
  const [data, setData] = useState<{ total: number; stages: { status: string; cnt: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { trackingApi.getFunnel().then(setData).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;
  if (!data?.stages?.length) return <p className="text-xs text-muted-foreground text-center py-8">No pipeline data yet.</p>;
  const maxCnt = Math.max(...data.stages.map(s => s.cnt), 1);
  return (
    <div className="flex flex-col gap-2">
      {data.stages.map((s, i) => (
        <div key={s.status} className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground w-28 text-right truncate">{statusLabels[s.status] || s.status}</span>
          <div className="flex-1 flex items-center gap-2">
            <div className="h-8 rounded-lg transition-all duration-500 flex items-center justify-end px-2 text-xs font-bold text-white" style={{ width: `${(s.cnt / maxCnt) * 100}%`, minWidth: s.cnt > 0 ? 32 : 0, backgroundColor: funnelColors[s.status] || '#64748b' }}>
              {s.cnt > 0 ? s.cnt : ''}
            </div>
            {i < data.stages.length - 1 && <ArrowDown size={12} className="text-muted-foreground shrink-0" />}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground mt-2">{data.total} total documents</p>
    </div>
  );
}

// ── Trends Section ─────────────────────────────────────────────────────────

function TrendsSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  useEffect(() => { setLoading(true); trackingApi.getTrends(days).then(setData).finally(() => setLoading(false)); }, [days]);
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;
  if (!data) return <p className="text-xs text-muted-foreground text-center py-8">No trend data yet.</p>;

  const maxVal = (arr: { cnt: number }[]) => Math.max(...arr.map(a => a.cnt), 1);

  function TrendChart({ label, items, color }: { label: string; items: { d: string; cnt: number }[]; color: string }) {
    if (!items?.length) return <div className="text-xs text-muted-foreground py-4">{label}: no data</div>;
    const max = maxVal(items);
    return (
      <Card size="sm">
        <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">{label}</CardTitle></CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex items-end gap-[2px] h-24">
            {items.map((p, i) => (
              <div key={p.d || i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                <div className="w-full rounded-t transition-all duration-200 hover:opacity-80" style={{ height: `${(p.cnt / max) * 100}%`, minHeight: p.cnt > 0 ? 4 : 0, backgroundColor: color }} />
                {items.length <= 14 && <span className="text-[8px] text-muted-foreground/40 truncate w-full text-center">{p.d?.slice(5) || ''}</span>}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>max: {max}</span>
            <span>total: {items.reduce((s, i) => s + i.cnt, 0)}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Period:</span>
        {[7, 14, 30, 90].map(d => (
          <Button key={d} variant={days === d ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setDays(d)}>{d}d</Button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <TrendChart label="Documents Created" items={data.docs_per_day} color="var(--accent-violet)" />
        <TrendChart label="Issues Created" items={data.issues_per_day} color="var(--accent-rose)" />
        <TrendChart label="Fixes Applied" items={data.fixes_per_day} color="var(--accent-emerald)" />
      </div>
      {data.processing_time?.samples > 0 && (
        <Card size="sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Processing Time</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="grid grid-cols-4 gap-3 text-center">
              <div><p className="text-lg font-bold">{data.processing_time.avg_val?.toFixed(1) || 0}</p><p className="text-[10px] text-muted-foreground">Avg (s)</p></div>
              <div><p className="text-lg font-bold">{data.processing_time.min_val?.toFixed(1) || 0}</p><p className="text-[10px] text-muted-foreground">Min (s)</p></div>
              <div><p className="text-lg font-bold">{data.processing_time.max_val?.toFixed(1) || 0}</p><p className="text-[10px] text-muted-foreground">Max (s)</p></div>
              <div><p className="text-lg font-bold">{data.processing_time.samples}</p><p className="text-[10px] text-muted-foreground">Samples</p></div>
            </div>
          </CardContent>
        </Card>
      )}
      {data.review_fields?.samples > 0 && (
        <Card size="sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Review Fields</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div><p className="text-lg font-bold">{data.review_fields.avg_val?.toFixed(1) || 0}</p><p className="text-[10px] text-muted-foreground">Avg per doc</p></div>
              <div><p className="text-lg font-bold">{data.review_fields.samples}</p><p className="text-[10px] text-muted-foreground">Docs with reviews</p></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Fields Section ─────────────────────────────────────────────────────────

function FieldsSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { trackingApi.getFieldQuality().then(setData).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;
  if (!data) return <p className="text-xs text-muted-foreground text-center py-8">No field data yet.</p>;

  return (
    <div className="flex flex-col gap-4">
      {data.field_totals?.length > 0 && (
        <Card size="sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Fields with Most Issues</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="flex flex-col gap-1">
              {data.field_totals.map((f: any) => {
                const breakdowns = data.field_breakdown?.filter((b: any) => b.field_name === f.field_name) || [];
                return (
                  <div key={f.field_name} className="flex items-center gap-2">
                    <span className="text-xs font-medium w-20 truncate">{f.field_name}</span>
                    <MiniBar items={breakdowns.map((b: any) => ({ label: b.issue_type, value: b.cnt }))} colorFn={t => funnelColors[t] || 'var(--accent-rose)'} />
                    <span className="text-xs text-muted-foreground w-8 text-right">{f.cnt}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {data.field_fixes?.length > 0 && (
        <Card size="sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Fields Most Fixed</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead><TableHead className="text-right">Fix Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.field_fixes.map((f: any) => (
                    <TableRow key={f.field_name}>
                      <TableCell className="text-xs">{f.field_name}</TableCell>
                      <TableCell className="text-xs text-right">{f.cnt}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Activity Section ───────────────────────────────────────────────────────

function ActivitySection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { trackingApi.getActivity().then(setData).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;
  if (!data) return <p className="text-xs text-muted-foreground text-center py-8">No activity data yet.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total Reviews" value={data.total_reviews} color="var(--accent-cyan)" icon={CheckCircle} />
        <StatCard label="Total Corrections" value={data.total_corrections} color="var(--accent-amber)" icon={RotateCcw} />
        <StatCard label="Total Fixes" value={data.total_fixes} color="var(--accent-violet)" icon={RefreshCw} />
      </div>
      {data.review_activity?.length > 0 && (
        <Card size="sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Review Activity by User</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead><TableHead className="text-right">Reviews Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.review_activity.map((r: any) => (
                    <TableRow key={r.reviewer_id}>
                      <TableCell className="text-xs font-mono">{r.reviewer_id.slice(0, 12)}...</TableCell>
                      <TableCell className="text-xs text-right font-semibold">{r.cnt}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      {data.fix_activity?.length > 0 && (
        <Card size="sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Fix Activity</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Triggered By</TableHead><TableHead className="text-right">Fix Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.fix_activity.map((r: any) => (
                    <TableRow key={r.triggered_by}>
                      <TableCell className="text-xs">{r.triggered_by}</TableCell>
                      <TableCell className="text-xs text-right">{r.cnt}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Document Search ────────────────────────────────────────────────────────

function DocumentSearch({ onResult }: { onResult: (stats: DocumentStats | null) => void }) {
  const [docId, setDocId] = useState('');
  const [loading, setLoading] = useState(false);
  const { show: showToast } = useToast();
  const handleSearch = async () => {
    if (!docId.trim()) return;
    setLoading(true);
    try { onResult(await trackingApi.getDocumentStats(docId.trim())); }
    catch (err) { onResult(null); showToast(err instanceof Error ? err.message : 'Document not found', 'error'); }
    finally { setLoading(false); }
  };
  return (
    <div className="flex gap-2">
      <Input placeholder="Enter document ID..." value={docId} onChange={e => setDocId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="max-w-md" />
      <Button variant="default" size="sm" onClick={handleSearch} disabled={loading}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        <span className="ml-1.5">Search</span>
      </Button>
    </div>
  );
}

function DocStatsResult({ stats }: { stats: DocumentStats | null }) {
  if (!stats) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold">{stats.filename || 'Document Details'}</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              ID: <code className="text-[10px]">{stats.document_id}</code>
              {stats.roll_number && <> &middot; Roll: {stats.roll_number}</>}
            </CardDescription>
          </div>
          <Badge variant={stats.status === 'verified' || stats.status === 'approved' ? 'default' : stats.status === 'failed' ? 'destructive' : 'secondary'}>{stats.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Retries</p>
            <p className="text-lg font-bold mt-0.5">{stats.retry_count}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Issues</p>
            <p className="text-lg font-bold mt-0.5">{stats.issues?.length || 0}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fixes</p>
            <p className="text-lg font-bold mt-0.5">{stats.fixes?.length || 0}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Escalation</p>
            <p className="text-lg font-bold mt-0.5">{stats.escalation_level || '—'}</p>
          </div>
        </div>
        {stats.error_message && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 mb-4">
            <p className="text-[11px] font-semibold text-destructive">Error</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stats.error_message}</p>
          </div>
        )}
        {stats.issues && stats.issues.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs font-semibold mb-2">Issues ({stats.issues.length})</h4>
            <div className="flex flex-col gap-1.5">
              {stats.issues.map((iss: any) => (
                <div key={iss.id || iss.issue_type + iss.created_at} className="bg-muted/30 rounded px-3 py-2 flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${severityColors[iss.severity] || ''}`}>{iss.severity}</Badge>
                  <span className="text-xs font-medium">{issueTypeLabels[iss.issue_type] || iss.issue_type}</span>
                  <span className="text-xs text-muted-foreground">{iss.description}</span>
                  {iss.resolved_at && <Badge variant="outline" className="text-[10px] ml-auto">Resolved</Badge>}
                </div>
              ))}
            </div>
          </div>
        )}
        {stats.fixes && stats.fixes.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold mb-2">Fixes ({stats.fixes.length})</h4>
            <div className="flex flex-col gap-1.5">
              {stats.fixes.map((fix: any) => (
                <div key={fix.id || fix.fix_type + fix.created_at} className="bg-muted/30 rounded px-3 py-2 flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{fix.fix_type}</Badge>
                  <span className="text-xs">{fix.field_name || '—'}</span>
                  <span className="text-xs text-muted-foreground">by {fix.triggered_by || 'system'}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{new Date(fix.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Processing Aggregate Section ───────────────────────────────────────────

function ProcessingAggSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { trackingApi.getProcessingAggregate().then(setData).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const statusColors: Record<string, string> = {
    verified: '#10b981', approved: '#22c55e', failed: '#dc2626',
    needs_review: '#f97316', processing: '#f59e0b', uploaded: '#94a3b8',
    azure_completed: '#3b82f6', validation_completed: '#8b5cf6',
  };

  return (
    <div className="flex flex-col gap-4">
      {data.metrics?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {data.metrics.map((m: any) => (
            <StatCard key={m.metric_name} label={m.metric_name.replace(/_/g, ' ')} value={m.avg_val?.toFixed(2) || 0}
              sub={`min: ${m.min_val?.toFixed(2) || 0} / max: ${m.max_val?.toFixed(2) || 0} (${m.samples} samples)`}
              color="var(--accent-cyan)" icon={BarChart3} />
          ))}
        </div>
      )}
      {data.escalation?.length > 0 && (
        <Card size="sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Escalation Distribution</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            <MiniBar items={data.escalation.map((e: any) => ({ label: e.escalation_level, value: e.cnt }))} colorFn={l => funnelColors[l] || 'var(--accent-muted)'} />
            <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
              {data.escalation.map((e: any) => (
                <span key={e.escalation_level}>{e.escalation_level.replace('level_', 'L')}: {e.cnt}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {data.status_breakdown?.length > 0 && (
        <Card size="sm">
          <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Status Breakdown</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Avg Retries</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.status_breakdown.map((s: any) => (
                    <TableRow key={s.status}>
                      <TableCell className="text-xs flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: statusColors[s.status] || '#64748b' }} />
                        {statusLabels[s.status] || s.status}
                      </TableCell>
                      <TableCell className="text-xs text-right">{s.cnt}</TableCell>
                      <TableCell className="text-xs text-right">{s.avg_retries || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Tracking View ─────────────────────────────────────────────────────

export function TrackingView() {
  const [summary, setSummary] = useState<TrackingSummary | null>(null);
  const [issues, setIssues] = useState<TrackingIssue[]>([]);
  const [issuesTotal, setIssuesTotal] = useState(0);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [dlqEntries, setDlqEntries] = useState<DlqEntry[]>([]);
  const [dlqLoading, setDlqLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [docStats, setDocStats] = useState<DocumentStats | null>(null);
  const [resolveDialog, setResolveDialog] = useState<TrackingIssue | null>(null);
  const [resolution, setResolution] = useState('manual_review');
  const [resolving, setResolving] = useState(false);
  const { show: showToast } = useToast();

  const [issueFilters, setIssueFilters] = useState({ severity: '', issue_type: '', resolved: '' });
  const [activeTab, setActiveTab] = useState('overview');

  const fetchSummary = useCallback(async () => {
    try { setSummary(await trackingApi.getTrackingSummary()); } catch { /* ignore */ }
    finally { setSummaryLoading(false); }
  }, []);

  const fetchIssues = useCallback(async () => {
    setIssuesLoading(true);
    try {
      const filters: any = {};
      if (issueFilters.severity) filters.severity = issueFilters.severity;
      if (issueFilters.issue_type) filters.issue_type = issueFilters.issue_type;
      if (issueFilters.resolved !== '') filters.resolved = issueFilters.resolved === 'true';
      const data = await trackingApi.getIssues(filters);
      setIssues(data.issues);
      setIssuesTotal(data.total);
    } catch { /* ignore */ }
    finally { setIssuesLoading(false); }
  }, [issueFilters]);

  const fetchDlq = useCallback(async () => {
    setDlqLoading(true);
    try { setDlqEntries(await trackingApi.getDlq()); }
    catch { /* ignore */ }
    finally { setDlqLoading(false); }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchIssues(); }, [fetchIssues]);
  useEffect(() => { fetchDlq(); }, [fetchDlq]);

  const handleResolve = async () => {
    if (!resolveDialog) return;
    setResolving(true);
    try {
      await trackingApi.resolveIssue(resolveDialog.id, resolution);
      showToast('Issue resolved', 'success');
      setResolveDialog(null);
      fetchIssues();
      fetchSummary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to resolve', 'error');
    } finally { setResolving(false); }
  };

  const handleDlqRetry = async (docId: string) => {
    try {
      await trackingApi.retryFromDlq(docId);
      showToast('Document queued for retry', 'success');
      fetchDlq();
      fetchSummary();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Retry failed', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 w-full max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Document Tracking</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Monitor issues, fixes, pipeline health, and document activity.</p>
        </div>
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : (
        <SummaryCards summary={summary} />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" className="text-xs"><Activity size={14} className="mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="issues" className="text-xs"><AlertTriangle size={14} className="mr-1.5" />Issues</TabsTrigger>
          <TabsTrigger value="dlq" className="text-xs"><XCircle size={14} className="mr-1.5" />DLQ</TabsTrigger>
          <TabsTrigger value="pipeline" className="text-xs"><Layers size={14} className="mr-1.5" />Pipeline</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs"><TrendingUp size={14} className="mr-1.5" />Trends</TabsTrigger>
          <TabsTrigger value="fields" className="text-xs"><BarChart3 size={14} className="mr-1.5" />Fields</TabsTrigger>
          <TabsTrigger value="activity" className="text-xs"><Users size={14} className="mr-1.5" />Activity</TabsTrigger>
          <TabsTrigger value="search" className="text-xs"><Search size={14} className="mr-1.5" />Doc Search</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {summary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <IssuesByTypeChart summary={summary} />
              <IssuesBySeverityChart summary={summary} />
            </div>
          )}
          <ProcessingAggSection />
        </TabsContent>

        {/* Issues */}
        <TabsContent value="issues" className="mt-4">
          <IssuesTable issues={issues} loading={issuesLoading} total={issuesTotal}
            onResolve={setResolveDialog} filters={issueFilters} onFilterChange={setIssueFilters} />
        </TabsContent>

        {/* DLQ */}
        <TabsContent value="dlq" className="mt-4">
          <DlqSection entries={dlqEntries} loading={dlqLoading} onRetry={handleDlqRetry} />
        </TabsContent>

        {/* Pipeline */}
        <TabsContent value="pipeline" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card size="sm">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Processing Funnel</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0"><FunnelSection /></CardContent>
            </Card>
            <div className="flex flex-col gap-3">
              {summary && <>
                <Card size="sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Escalation Levels</CardTitle></CardHeader>
                  <CardContent className="p-4 pt-0">
                    <MiniBar items={Object.entries(summary.by_escalation).map(([k, v]) => ({ label: k, value: v }))}
                      colorFn={l => l === 'level_4' ? '#dc2626' : l === 'level_3' ? '#f97316' : l === 'level_2' ? '#f59e0b' : '#10b981'} />
                    <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                      {Object.entries(summary.by_escalation).map(([k, v]) => <span key={k}>{k.replace('level_', 'L')}: {v}</span>)}
                    </div>
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-semibold">Status Distribution</CardTitle></CardHeader>
                  <CardContent className="p-4 pt-0">
                    <MiniBar items={Object.entries(summary.by_status).filter(([, v]) => v > 0).map(([k, v]) => ({ label: k, value: v }))}
                      colorFn={l => funnelColors[l] || '#64748b'} />
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-1">
                      {Object.entries(summary.by_status).filter(([, v]) => v > 0).map(([k, v]) => <span key={k}>{statusLabels[k] || k}: {v}</span>)}
                    </div>
                  </CardContent>
                </Card>
              </>}
            </div>
          </div>
        </TabsContent>

        {/* Trends */}
        <TabsContent value="trends" className="mt-4">
          <TrendsSection />
        </TabsContent>

        {/* Fields */}
        <TabsContent value="fields" className="mt-4">
          <FieldsSection />
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="mt-4">
          <ActivitySection />
        </TabsContent>

        {/* Doc Search */}
        <TabsContent value="search" className="mt-4">
          <div className="flex flex-col gap-4">
            <DocumentSearch onResult={setDocStats} />
            <DocStatsResult stats={docStats} />
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!resolveDialog} onOpenChange={open => !open && setResolveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Issue #{resolveDialog?.id}</DialogTitle>
            <DialogDescription>{resolveDialog?.description}</DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <label className="text-xs font-medium mb-1.5 block">Resolution Type</label>
            <select value={resolution} onChange={e => setResolution(e.target.value)} className="h-8 text-xs rounded-md border border-input bg-background px-2.5 w-full">
              <option value="manual_review">Manual Review</option>
              <option value="auto_corrected">Auto-Corrected</option>
              <option value="human_verified">Human-Verified</option>
              <option value="ignored">Ignored (False Positive)</option>
              <option value="reprocess_fixed">Reprocess Fixed</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResolveDialog(null)}>Cancel</Button>
            <Button variant="default" size="sm" onClick={handleResolve} disabled={resolving}>
              {resolving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <CheckCircle size={14} className="mr-1.5" />}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

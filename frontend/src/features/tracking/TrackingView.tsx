import { useEffect, useState, useCallback } from 'react';
import { trackingApi } from '@/api/tracking';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw, Search, RotateCcw } from 'lucide-react';
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

function SummaryCards({ summary }: { summary: TrackingSummary | null }) {
  if (!summary) return null;
  const cards = [
    { label: 'Total Issues', value: summary.total_issues, color: 'var(--accent-rose)', icon: AlertTriangle },
    { label: 'Resolved', value: summary.resolved_issues, color: 'var(--accent-emerald)', icon: CheckCircle },
    { label: 'Resolution Rate', value: `${Math.round(summary.resolution_rate * 100)}%`, color: 'var(--accent-cyan)', icon: Activity },
    { label: 'Total Fixes', value: summary.total_fixes, color: 'var(--accent-violet)', icon: RotateCcw },
    { label: 'Total Retries', value: summary.total_retries, color: 'var(--accent-amber)', icon: RefreshCw },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <Card key={c.label} size="sm" className="relative overflow-hidden">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.color}15` }}>
                <Icon size={16} style={{ color: c.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{c.label}</p>
                <p className="text-xl font-bold mt-0.5">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function IssuesByTypeChart({ summary }: { summary: TrackingSummary | null }) {
  if (!summary) return null;
  const types = Object.entries(summary.issues_by_type);
  if (types.length === 0) return null;
  const total = types.reduce((s, [, v]) => s + v, 0);
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold">Issues by Type</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col gap-1.5">
          {types.map(([type, count]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-24 truncate">{issueTypeLabels[type] || type}</span>
              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(count / total) * 100}%`, backgroundColor: 'var(--accent-rose)' }}
                />
              </div>
              <span className="text-[11px] font-medium w-6 text-right">{count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function IssuesBySeverityChart({ summary }: { summary: TrackingSummary | null }) {
  if (!summary) return null;
  const sevs = Object.entries(summary.issues_by_severity);
  if (sevs.length === 0) return null;
  const total = sevs.reduce((s, [, v]) => s + v, 0);
  return (
    <Card size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold">Issues by Severity</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col gap-1.5">
          {sevs.map(([sev, count]) => (
            <div key={sev} className="flex items-center gap-2">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 w-16 justify-center ${severityColors[sev] || ''}`}>{sev}</Badge>
              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(count / total) * 100}%`, backgroundColor: sev === 'critical' ? 'var(--accent-rose)' : sev === 'error' ? 'var(--accent-amber)' : sev === 'warning' ? 'var(--accent-orange)' : 'var(--accent-cyan)' }}
                />
              </div>
              <span className="text-[11px] font-medium w-6 text-right">{count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function IssuesTable({
  issues,
  loading,
  total,
  onResolve,
  filters,
  onFilterChange,
}: {
  issues: TrackingIssue[];
  loading: boolean;
  total: number;
  onResolve: (issue: TrackingIssue) => void;
  filters: { severity: string; issue_type: string; resolved: string };
  onFilterChange: (f: typeof filters) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
          <select
              value={filters.severity}
              onChange={e => onFilterChange({ ...filters, severity: e.target.value })}
              className="h-8 text-xs rounded-md border border-input bg-background px-2.5"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select
              value={filters.issue_type}
              onChange={e => onFilterChange({ ...filters, issue_type: e.target.value })}
              className="h-8 text-xs rounded-md border border-input bg-background px-2.5"
            >
              <option value="">All Types</option>
              {Object.entries(issueTypeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={filters.resolved}
              onChange={e => onFilterChange({ ...filters, resolved: e.target.value })}
              className="h-8 text-xs rounded-md border border-input bg-background px-2.5"
            >
              <option value="">All Status</option>
              <option value="false">Unresolved</option>
              <option value="true">Resolved</option>
            </select>
        <span className="text-xs text-muted-foreground ml-auto">{total} issue{total !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <CheckCircle size={32} className="opacity-30" />
          <p className="text-sm font-medium">No issues found</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Doc ID</TableHead>
                <TableHead>Field</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map(issue => (
                <TableRow key={issue.id}>
                  <TableCell className="text-xs font-mono">{issue.id}</TableCell>
                  <TableCell className="text-xs font-mono max-w-[100px] truncate" title={issue.document_id}>{issue.document_id.slice(0, 8)}...</TableCell>
                  <TableCell className="text-xs">{issue.field_name || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{issueTypeLabels[issue.issue_type] || issue.issue_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${severityColors[issue.severity] || ''}`}>{issue.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{issue.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(issue.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {issue.resolved_at ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">Resolved</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!issue.resolved_at && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onResolve(issue)}>
                        Resolve
                      </Button>
                    )}
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

function DlqSection({
  entries,
  loading,
  onRetry,
}: {
  entries: DlqEntry[];
  loading: boolean;
  onRetry: (docId: string) => void;
}) {
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  const handleRetry = async (docId: string) => {
    setRetrying(prev => new Set(prev).add(docId));
    await onRetry(docId);
    setRetrying(prev => { const next = new Set(prev); next.delete(docId); return next; });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>;
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <CheckCircle size={32} className="opacity-30" />
        <p className="text-sm font-medium">No failed documents in DLQ</p>
        <p className="text-xs">All documents processed successfully.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Doc ID</TableHead>
            <TableHead>Filename</TableHead>
            <TableHead>Retries</TableHead>
            <TableHead>Issues</TableHead>
            <TableHead>Error</TableHead>
            <TableHead>Last Error</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(entry => (
            <TableRow key={entry.document_id}>
              <TableCell className="text-xs font-mono max-w-[80px] truncate" title={entry.document_id}>{entry.document_id.slice(0, 8)}...</TableCell>
              <TableCell className="text-xs max-w-[150px] truncate">{entry.filename || '—'}</TableCell>
              <TableCell className="text-xs">{entry.retry_count}</TableCell>
              <TableCell className="text-xs">{entry.issue_count}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate text-destructive">{entry.error_message || '—'}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {entry.last_error_at ? new Date(entry.last_error_at).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleRetry(entry.document_id)}
                  disabled={retrying.has(entry.document_id)}
                >
                  {retrying.has(entry.document_id) ? (
                    <Loader2 size={12} className="animate-spin mr-1" />
                  ) : (
                    <RefreshCw size={12} className="mr-1" />
                  )}
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

function DocumentSearch({ onResult }: { onResult: (stats: DocumentStats | null) => void }) {
  const [docId, setDocId] = useState('');
  const [loading, setLoading] = useState(false);
  const { show: showToast } = useToast();

  const handleSearch = async () => {
    if (!docId.trim()) return;
    setLoading(true);
    try {
      const data = await trackingApi.getDocumentStats(docId.trim());
      onResult(data);
    } catch (err) {
      onResult(null);
      showToast(err instanceof Error ? err.message : 'Document not found', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Enter document ID..."
        value={docId}
        onChange={e => setDocId(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSearch()}
        className="max-w-md"
      />
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
          <Badge variant={stats.status === 'verified' || stats.status === 'approved' ? 'default' : stats.status === 'failed' ? 'destructive' : 'secondary'}>
            {stats.status}
          </Badge>
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
              {stats.issues.map(iss => (
                <div key={iss.id} className="bg-muted/30 rounded px-3 py-2 flex items-center gap-2">
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
              {stats.fixes.map(fix => (
                <div key={fix.id} className="bg-muted/30 rounded px-3 py-2 flex items-center gap-2">
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
  const [activeTab, setActiveTab] = useState('issues');

  const fetchSummary = useCallback(async () => {
    try {
      const data = await trackingApi.getTrackingSummary();
      setSummary(data);
    } catch { /* ignore */ } finally {
      setSummaryLoading(false);
    }
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
    } catch { /* ignore */ } finally {
      setIssuesLoading(false);
    }
  }, [issueFilters]);

  const fetchDlq = useCallback(async () => {
    setDlqLoading(true);
    try {
      const data = await trackingApi.getDlq();
      setDlqEntries(data);
    } catch { /* ignore */ } finally {
      setDlqLoading(false);
    }
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
    } finally {
      setResolving(false);
    }
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
          <p className="text-xs text-muted-foreground mt-0.5">Monitor issues, fixes, and document health across the pipeline.</p>
        </div>
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : (
        <SummaryCards summary={summary} />
      )}

      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <IssuesByTypeChart summary={summary} />
          <IssuesBySeverityChart summary={summary} />
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="issues" className="text-xs">
            <AlertTriangle size={14} className="mr-1.5" />
            Issues
          </TabsTrigger>
          <TabsTrigger value="dlq" className="text-xs">
            <XCircle size={14} className="mr-1.5" />
            Dead Letter Queue
          </TabsTrigger>
          <TabsTrigger value="search" className="text-xs">
            <Search size={14} className="mr-1.5" />
            Document Search
          </TabsTrigger>
        </TabsList>

        <TabsContent value="issues" className="mt-4">
          <IssuesTable
            issues={issues}
            loading={issuesLoading}
            total={issuesTotal}
            onResolve={setResolveDialog}
            filters={issueFilters}
            onFilterChange={setIssueFilters}
          />
        </TabsContent>

        <TabsContent value="dlq" className="mt-4">
          <DlqSection entries={dlqEntries} loading={dlqLoading} onRetry={handleDlqRetry} />
        </TabsContent>

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
            <DialogDescription>
              {resolveDialog?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <label className="text-xs font-medium mb-1.5 block">Resolution Type</label>
            <select
              value={resolution}
              onChange={e => setResolution(e.target.value)}
              className="h-8 text-xs rounded-md border border-input bg-background px-2.5 w-full"
            >
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

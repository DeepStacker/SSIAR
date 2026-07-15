import { API_BASE, fetchJson } from './client';
import type { DocumentStats, TrackingSummary, DlqEntry, TrackingIssue } from './types';

export const trackingApi = {
  getDocumentStats: async (docId: string): Promise<DocumentStats> => {
    return fetchJson<DocumentStats>(`${API_BASE}/stats/document/${docId}`);
  },

  getTrackingSummary: async (): Promise<TrackingSummary> => {
    return fetchJson<TrackingSummary>(`${API_BASE}/stats/summary`);
  },

  getDlq: async (): Promise<DlqEntry[]> => {
    const raw = await fetchJson<{ total: number; documents: any[] }>(`${API_BASE}/stats/dlq`);
    const docs = raw?.documents ?? [];
    return docs.map((d: any) => ({
      document_id: d.id ?? d.document_id,
      status: d.status,
      retry_count: d.retry_count ?? 0,
      error_message: d.error_message,
      filename: d.filename,
      roll_number: d.roll_number,
      issue_count: d.issue_count ?? 0,
      fix_count: d.fix_count ?? 0,
      last_error_at: d.created_at,
    }));
  },

  retryFromDlq: async (docId: string): Promise<{ message: string }> => {
    return fetchJson<{ message: string }>(`${API_BASE}/stats/dlq/${docId}/retry`, { method: 'POST' });
  },

  getIssues: async (filters?: {
    severity?: string;
    issue_type?: string;
    resolved?: boolean;
    document_id?: string;
  }): Promise<{ total: number; issues: TrackingIssue[] }> => {
    const params = new URLSearchParams();
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.issue_type) params.set('issue_type', filters.issue_type);
    if (filters?.resolved !== undefined) params.set('resolved', String(filters.resolved));
    if (filters?.document_id) params.set('document_id', filters.document_id);
    const qs = params.toString();
    return fetchJson<{ total: number; issues: TrackingIssue[] }>(`${API_BASE}/stats/issues${qs ? `?${qs}` : ''}`);
  },

  resolveIssue: async (issueId: number, resolution: string): Promise<{ message: string }> => {
    return fetchJson<{ message: string }>(`${API_BASE}/stats/issues/${issueId}/resolve?resolution=${encodeURIComponent(resolution)}`, { method: 'POST' });
  },
};

import { API_BASE, authHeaders, redirectToLogin, fetchJson, unwrapV3, extractErrorMessage } from './client';
import type { Document, DocumentDetails } from './types';

async function v3Post<T>(url: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T> {
  const headers = { ...authHeaders(), "Content-Type": "application/json", ...(options?.headers || {}) };
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 401) { redirectToLogin(); throw new Error('Session expired'); }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(err));
  }
  const body = await response.json();
  return unwrapV3<T>(body);
}

export const documentsApi = {
  listDocuments: async (fields?: string[]): Promise<Document[]> => {
    const params = new URLSearchParams();
    if (fields && fields.length > 0) {
      params.set('fields', fields.join(','));
    }
    const qs = params.toString();
    return fetchJson<Document[]>(`${API_BASE}/documents${qs ? `?${qs}` : ''}`);
  },

  getDocumentDetails: async (docId: string): Promise<DocumentDetails> => {
    return fetchJson<DocumentDetails>(`${API_BASE}/documents/${docId}`)
  },

  verifyDocument: async (
    docId: string,
    data: {
      roll_number: string;
      class_val: string;
      dob: string;
      gender: string;
      consent: string;
      responses: Record<string, number | number[]>;
      academic_scores: Record<string, string>;
      remarks: string;
    }
  ): Promise<{ message: string }> => {
    return v3Post<{ message: string }>(`${API_BASE}/documents/${docId}/verify`, { body: data })
  },

  deleteDocument: async (docId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/documents/${docId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (response.status === 401) { redirectToLogin(); throw new Error('Session expired'); }
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    const body = await response.json();
    return unwrapV3<{ message: string }>(body);
  },

  reprocessDocument: async (docId: string): Promise<{ message: string }> => {
    return v3Post<{ message: string }>(`${API_BASE}/documents/${docId}/reprocess`)
  },

  reprocessField: async (docId: string, fieldName: string): Promise<{
    field_name: string;
    value: string;
    confidence: number;
    valid: boolean;
    updated: boolean;
    message?: string;
  }> => {
    const response = await fetch(`${API_BASE}/documents/${docId}/reprocess-field/${fieldName}`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    const body = await response.json();
    return unwrapV3(body);
  },

  bulkDelete: async (docIds: string[]): Promise<{ message: string }> => {
    return v3Post<{ message: string }>(`${API_BASE}/documents/bulk-delete`, { body: { doc_ids: docIds } })
  },

  bulkVerify: async (docIds: string[]): Promise<{ message: string }> => {
    return v3Post<{ message: string }>(`${API_BASE}/documents/bulk-verify`, { body: { doc_ids: docIds } })
  },

  recoverStuckDocuments: async (): Promise<{ recovered: number; message: string }> => {
    return v3Post<{ recovered: number; message: string }>(`${API_BASE}/documents/recover-stuck`)
  },

  getCropUrl: (docId: string, filename: string): string => {
    const token = localStorage.getItem('ssiar_token');
    return `${API_BASE}/crops/${docId}/${filename}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  getPageUrl: (docId: string, pageNum: number): string => {
    const token = localStorage.getItem('ssiar_token');
    return `${API_BASE}/pages/${docId}/${pageNum}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
};

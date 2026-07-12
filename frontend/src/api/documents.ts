import { API_BASE, authHeaders, clearAuth, fetchJson } from './client';
import type { Document, DocumentDetails } from './types';

export const documentsApi = {
  listDocuments: async (): Promise<Document[]> => {
    return fetchJson<Document[]>(`${API_BASE}/documents`)
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
    const response = await fetch(`${API_BASE}/documents/${docId}/verify`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Failed to verify document");
    }
    return response.json();
  },

  deleteDocument: async (docId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/documents/${docId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (response.status === 401) { clearAuth(); window.location.href = '/'; throw new Error('Session expired'); }
    if (!response.ok) throw new Error("Delete failed");
    return response.json();
  },

  reprocessDocument: async (docId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/documents/${docId}/reprocess`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to reprocess document");
    }
    return response.json();
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
      throw new Error(err.detail || "Failed to reprocess field");
    }
    return response.json();
  },

  bulkDelete: async (docIds: string[]): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/documents/bulk-delete`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ doc_ids: docIds }),
    });
    if (!response.ok) throw new Error("Bulk delete failed");
    return response.json();
  },

  bulkVerify: async (docIds: string[]): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/documents/bulk-verify`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ doc_ids: docIds }),
    });
    if (!response.ok) throw new Error("Bulk verify failed");
    return response.json();
  },

  recoverStuckDocuments: async (): Promise<{ recovered: number; message: string }> => {
    const response = await fetch(`${API_BASE}/documents/recover-stuck`, {
      method: "POST",
      headers: { ...authHeaders() },
    });
    if (!response.ok) throw new Error("Recovery failed");
    return response.json();
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

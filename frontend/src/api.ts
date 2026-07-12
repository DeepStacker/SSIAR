import type { LucideIcon } from 'lucide-react'

export const API_BASE = import.meta.env.VITE_API_BASE || "/api";

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

const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { "Authorization": `Bearer ${token}` } : {};
};

// ── Simple TTL cache for GET requests ──
interface CacheEntry { data: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>()
const DEFAULT_TTL = 30_000 // 30 seconds

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

export interface Document {
  id: string;
  filename: string;
  status: string;
  created_at: string;
  roll_number?: string;
  class?: string;
  dob?: string;
  gender?: string;
  consent?: string;
  verified_by_human?: number;
  error_message?: string;
  classification?: {
    type: "mobile_photo" | "scanned" | "photocopy" | "fax_like";
    dpi: number;
    pages: number;
    is_color: boolean;
  };
  escalation_level?: "level_1" | "level_2" | "level_3" | "level_4";
}

export interface DocumentDetails extends Document {
  responses: Record<string, number | number[]>;
  academic_scores: {
    math_pct: string;
    science_pct: string;
    language_pct: string;
    rank: string;
  };
  remarks?: string;
  confidence_scores: {
    ocr: Record<string, number>;
    checkbox: Record<string, string>;
    multi_ticks?: Record<string, number[]>;
    review_fields?: string[];
    v2_trust?: Record<string, { trust_confidence?: number; bbox?: number[]; page?: number; polygon?: number[] }>;
  };
  quality_report?: {
    blur: number;
    rotation: number;
    contrast: number;
    shadow: boolean;
    fold: boolean;
    crop: boolean;
    noise: number;
    quality: number;
  };
}

export interface EditHistoryEntry {
  field_name: string;
  old_value: string | null;
  new_value: string;
  edited_at: string;
}

export interface ExportFilters {
  format?: "excel" | "csv";
  lang?: string;
  status?: string;
  class?: string;
  date_from?: string;
  date_to?: string;
  roll_prefix?: string;
  columns?: string;
  doc_ids?: string;
}

export interface QueueStatus {
  total: number;
  processing: number;
  needs_review: number;
  verified: number;
  failed: number;
  by_escalation: {
    level_1: number;
    level_2: number;
    level_3: number;
    level_4: number;
  };
  workers: number;
}

export interface BatchFolderResponse {
  message: string;
  total: number;
  auto_verify: boolean;
  documents: Array<{ doc_id: string; filename: string }>;
}

export const api = {
  // Upload scanned PDFs
  uploadFiles: async (files: File[], autoVerify?: boolean, split?: boolean): Promise<{ message: string; document_ids: string[]; auto_verify: boolean }> => {
    const formData = new FormData();
    files.forEach(file => formData.append("files", file));
    const params = new URLSearchParams();
    if (autoVerify) params.set("auto_verify", "true");
    if (split) params.set("split", "true");
    const qs = params.toString();
    const headers = authHeaders();
    const response = await fetch(`${API_BASE}/upload${qs ? '?' + qs : ''}`, {
      method: "POST",
      headers,
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to upload files");
    }
    return response.json();
  },

  // Batch process a folder of PDFs on the server
  batchProcessFolder: async (folderPath: string, autoVerify?: boolean): Promise<BatchFolderResponse> => {
    const response = await fetch(`${API_BASE}/batch/process-folder`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ folder_path: folderPath, auto_verify: autoVerify ?? false }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to process folder");
    }
    return response.json();
  },

  // List all forms in the queue
  listDocuments: async (): Promise<Document[]> => {
    return fetchJson<Document[]>(`${API_BASE}/documents`)
  },

  // Get full data details for a specific form
  getDocumentDetails: async (docId: string): Promise<DocumentDetails> => {
    return fetchJson<DocumentDetails>(`${API_BASE}/documents/${docId}`)
  },

  // Submit verified data back to SQLite
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

  // Delete a document from SQLite and shared folders
  deleteDocument: async (docId: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/documents/${docId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (response.status === 401) { clearAuth(); window.location.href = '/'; throw new Error('Session expired'); }
    if (!response.ok) throw new Error("Delete failed");
    return response.json();
  },

  // Reprocess a single document — re-runs the full pipeline
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

  // Reprocess a single field — re-runs OCR on just that field's crop
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

  // #33: Bulk operations
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

  bulkReprocess: async (docIds: string[]): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/documents/bulk-reprocess`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ doc_ids: docIds }),
    });
    if (!response.ok) throw new Error("Bulk reprocess failed");
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

  // #26: Audit trail
  getEditHistory: async (docId: string): Promise<EditHistoryEntry[]> => {
    return fetchJson<EditHistoryEntry[]>(`${API_BASE}/documents/${docId}/history`)
  },

  // #17: Queue status
  getQueueStatus: async (): Promise<QueueStatus> => {
    return fetchJson<QueueStatus>(`${API_BASE}/queue-status`)
  },

  // URL for serving a crop image
  getCropUrl: (docId: string, filename: string): string => {
    const token = getToken();
    return `${API_BASE}/crops/${docId}/${filename}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  // URL for serving a full aligned page image
  getPageUrl: (docId: string, pageNum: number): string => {
    const token = getToken();
    return `${API_BASE}/pages/${docId}/${pageNum}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  // #34/#35/#36: Export link helper with filter support
  getExportUrl: (filters: ExportFilters = {}): string => {
    const params = new URLSearchParams();
    params.set("format", filters.format || "excel");
    if (filters.lang) params.set("lang", filters.lang);
    if (filters.status) params.set("status", filters.status);
    if (filters.class) params.set("class", filters.class);
    if (filters.date_from) params.set("date_from", filters.date_from);
    if (filters.date_to) params.set("date_to", filters.date_to);
    if (filters.roll_prefix) params.set("roll_prefix", filters.roll_prefix);
    if (filters.columns) params.set("columns", filters.columns);
    if (filters.doc_ids) params.set("doc_ids", filters.doc_ids);
    const token = getToken();
    if (token) params.set("token", token);
    return `${API_BASE}/export?${params.toString()}`;
  },

  // Analytics endpoints
  getAnalyticsSummary: async (filters?: { class?: string; gender?: string }) => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/summary${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsDemographics: async (filters?: { class?: string; gender?: string }) => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/demographics${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsQuestionnaire: async (filters?: { class?: string; gender?: string }) => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/questionnaire${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsAcademic: async (filters?: { class?: string; gender?: string }) => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/academic${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsCorrelations: async (filters?: { class?: string; gender?: string }) => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/correlations${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsOutliers: async (filters?: { class?: string; gender?: string }) => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/outliers${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsDataQuality: async (filters?: { class?: string; gender?: string }) => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/data-quality${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsProcessing: async (filters?: { class?: string; gender?: string }) => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/processing${qs ? `?${qs}` : ''}`);
  },
  getPerFieldConfidence: async (filters?: { class?: string; gender?: string }) => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/per-field-confidence${qs ? `?${qs}` : ''}`);
  },
  getResearchExportUrl: (format: "csv" | "excel" | "spss", filters?: { class?: string; gender?: string; columns?: string }): string => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    if (filters?.columns) params.set('columns', filters.columns);
    const token = getToken();
    if (token) params.set("token", token);
    const qs = params.toString();
    return `${API_BASE}/analytics/export/${format}${qs ? `?${qs}` : ''}`;
  },

  // #32: SSE event source URL
  getEventsUrl: (): string => {
    const token = getToken();
    return `${API_BASE}/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },

  getDlqTasks: async (filters?: {
    document_id?: string;
    field_type?: 'demographic' | 'sdq';
    priority?: 'critical' | 'low_trust';
    error_type?: string;
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
  }): Promise<{ tasks: DlqTask[]; total: number }> => {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.document_id) params.set('document_id', filters.document_id);
      if (filters.field_type) params.set('field_type', filters.field_type);
      if (filters.priority) params.set('priority', filters.priority);
      if (filters.error_type) params.set('error_type', filters.error_type);
      if (filters.sort_by) params.set('sort_by', filters.sort_by);
      if (filters.sort_dir) params.set('sort_dir', filters.sort_dir);
    }
    const qs = params.toString();
    return fetchJson<{ tasks: DlqTask[]; total: number }>(`${API_BASE}/v2/review/tasks${qs ? `?${qs}` : ''}`);
  },

  submitDlqResolution: async (taskId: number, value: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/v2/review/tasks/${taskId}/submit?corrected_value=${encodeURIComponent(value)}`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to submit resolution: ${response.status} - ${errText}`);
    }
    return response.json();
  }
};

export interface DlqTask {
  id: number;
  document_id: string;
  filename: string;
  field_name: string;
  original_value: string;
  corrected_value: string | null;
  priority: 'critical' | 'low_trust';
  status: 'pending' | 'completed';
  page_number: number;
  confidence_score: number;
  error_details: string;
  bbox?: number[];
  polygon?: number[];
}

export type ViewMode = 'dashboard' | 'reporting' | 'analytics' | 'dlq';
export type TabType = 'all' | 'needs_review' | 'verified' | 'processing' | 'failed';

export const STATUS_REVIEW = new Set(['needs_review', 'review_required']);
export const STATUS_VERIFIED = new Set(['verified', 'approved']);
export const STATUS_PROCESSING = new Set(['processing', 'uploaded', 'queued', 'azure_completed', 'validation_completed']);
export const STATUS_FAILED = new Set(['failed']);
export type SortKey = 'filename' | 'roll_number' | 'status' | 'created_at';
export type ReportFormat = 'excel' | 'csv';

export interface ZoomImage {
  src: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface EscBreakdown {
  level_1: number;
  level_2: number;
  level_3: number;
  level_4: number;
}

export interface StatCardItem {
  label: string;
  value: number;
  color: string;
  icon: LucideIcon;
  pulse?: boolean;
}

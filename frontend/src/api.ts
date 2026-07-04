const API_BASE = "http://localhost:8000/api";

export interface Document {
  id: string;
  filename: string;
  status: "processing" | "needs_review" | "verified" | "failed";
  created_at: string;
  roll_number?: string;
  class?: string;
  dob?: string;
  gender?: string;
  consent?: string;
  verified_by_human?: number;
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
  lang?: "en" | "hi";
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
  uploadFiles: async (files: File[], autoVerify?: boolean, split?: boolean): Promise<any> => {
    const formData = new FormData();
    files.forEach(file => formData.append("files", file));
    const params = new URLSearchParams();
    if (autoVerify) params.set("auto_verify", "true");
    if (split) params.set("split", "true");
    const qs = params.toString();
    const response = await fetch(`${API_BASE}/upload${qs ? '?' + qs : ''}`, {
      method: "POST",
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
      headers: { "Content-Type": "application/json" },
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
    const response = await fetch(`${API_BASE}/documents`);
    if (!response.ok) {
      throw new Error("Failed to fetch documents list");
    }
    return response.json();
  },

  // Get full data details for a specific form
  getDocumentDetails: async (docId: string): Promise<DocumentDetails> => {
    const response = await fetch(`${API_BASE}/documents/${docId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch document details");
    }
    return response.json();
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
  ): Promise<any> => {
    const response = await fetch(`${API_BASE}/documents/${docId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Failed to verify document");
    }
    return response.json();
  },

  // Delete a document from SQLite and shared folders
  deleteDocument: async (docId: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/documents/${docId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error("Failed to delete document");
    }
    return response.json();
  },

  // Reprocess a single document — re-runs the full pipeline
  reprocessDocument: async (docId: string): Promise<any> => {
    const response = await fetch(`${API_BASE}/documents/${docId}/reprocess`, {
      method: "POST",
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
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to reprocess field");
    }
    return response.json();
  },

  // #33: Bulk operations
  bulkDelete: async (docIds: string[]): Promise<any> => {
    const response = await fetch(`${API_BASE}/documents/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_ids: docIds }),
    });
    if (!response.ok) throw new Error("Bulk delete failed");
    return response.json();
  },

  bulkVerify: async (docIds: string[]): Promise<any> => {
    const response = await fetch(`${API_BASE}/documents/bulk-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_ids: docIds }),
    });
    if (!response.ok) throw new Error("Bulk verify failed");
    return response.json();
  },

  bulkReprocess: async (docIds: string[]): Promise<any> => {
    const response = await fetch(`${API_BASE}/documents/bulk-reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_ids: docIds }),
    });
    if (!response.ok) throw new Error("Bulk reprocess failed");
    return response.json();
  },

  // #26: Audit trail
  getEditHistory: async (docId: string): Promise<EditHistoryEntry[]> => {
    const response = await fetch(`${API_BASE}/documents/${docId}/history`);
    if (!response.ok) throw new Error("Failed to fetch edit history");
    return response.json();
  },

  // #17: Queue status
  getQueueStatus: async (): Promise<QueueStatus> => {
    const response = await fetch(`${API_BASE}/queue-status`);
    if (!response.ok) throw new Error("Failed to fetch queue status");
    return response.json();
  },

  // URL for serving a crop image
  getCropUrl: (docId: string, filename: string): string => {
    return `${API_BASE}/crops/${docId}/${filename}`;
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
    return `${API_BASE}/export?${params.toString()}`;
  },

  // #32: SSE event source URL
  getEventsUrl: (): string => `${API_BASE}/events`
};

export type ViewMode = 'dashboard' | 'reporting';
export type TabType = 'all' | 'needs_review' | 'verified' | 'processing' | 'failed';
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
  icon: any;
  pulse?: boolean;
}

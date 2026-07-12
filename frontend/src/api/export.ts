import { API_BASE } from './client';

export const exportApi = {
  getExportUrl: (filters: {
    format?: "excel" | "csv";
    lang?: string;
    status?: string;
    class?: string;
    date_from?: string;
    date_to?: string;
    roll_prefix?: string;
    columns?: string;
    doc_ids?: string;
  } = {}): string => {
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
    const token = localStorage.getItem('ssiar_token');
    if (token) params.set("token", token);
    return `${API_BASE}/export?${params.toString()}`;
  },

  getResearchExportUrl: (format: "csv" | "excel" | "spss", filters?: { class?: string; gender?: string; columns?: string }): string => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    if (filters?.columns) params.set('columns', filters.columns);
    const token = localStorage.getItem('ssiar_token');
    if (token) params.set("token", token);
    const qs = params.toString();
    return `${API_BASE}/export/analytics/${format}${qs ? `?${qs}` : ''}`;
  },
};

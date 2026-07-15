import { API_BASE, fetchJson, authHeaders, unwrapV3, extractErrorMessage } from './client';
import type {
  QueueStatus, SummaryData, DemographicsData, QuestionnaireData,
  AcademicData, ProcessingData, FieldConfData, DataQualityData
} from './types';

export const analyticsApi = {
  getAnalyticsSummary: async (filters?: { class?: string; gender?: string }): Promise<SummaryData> => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson<SummaryData>(`${API_BASE}/analytics/summary${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsDemographics: async (filters?: { class?: string; gender?: string }): Promise<DemographicsData> => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson<DemographicsData>(`${API_BASE}/analytics/demographics${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsQuestionnaire: async (filters?: { class?: string; gender?: string }): Promise<QuestionnaireData> => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson<QuestionnaireData>(`${API_BASE}/analytics/questionnaire${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsAcademic: async (filters?: { class?: string; gender?: string }): Promise<AcademicData> => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson<AcademicData>(`${API_BASE}/analytics/academic${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsDataQuality: async (filters?: { class?: string; gender?: string }): Promise<DataQualityData> => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson(`${API_BASE}/analytics/data-quality${qs ? `?${qs}` : ''}`);
  },
  getAnalyticsProcessing: async (filters?: { class?: string; gender?: string }): Promise<ProcessingData> => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson<ProcessingData>(`${API_BASE}/analytics/processing${qs ? `?${qs}` : ''}`);
  },
  getPerFieldConfidence: async (filters?: { class?: string; gender?: string }): Promise<FieldConfData> => {
    const params = new URLSearchParams();
    if (filters?.class && filters.class !== 'all') params.set('class', filters.class);
    if (filters?.gender && filters.gender !== 'all') params.set('gender', filters.gender);
    const qs = params.toString();
    return fetchJson<FieldConfData>(`${API_BASE}/analytics/per-field-confidence${qs ? `?${qs}` : ''}`);
  },

  getQueueStatus: async (): Promise<QueueStatus> => {
    return fetchJson<QueueStatus>(`${API_BASE}/system/queue-status`)
  },

  getVerifyTasks: async (filters?: {
    document_id?: string;
    field_type?: 'demographic' | 'sdq';
    priority?: 'critical' | 'low_trust';
    error_type?: string;
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
  }): Promise<{ tasks: import('./types').VerifyTask[]; total: number }> => {
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
    return fetchJson<{ tasks: import('./types').VerifyTask[]; total: number }>(`${API_BASE}/review/tasks${qs ? `?${qs}` : ''}`);
  },

  submitVerifyResolution: async (taskId: number, value: string): Promise<{ message: string }> => {
    const response = await fetch(`${API_BASE}/review/tasks/${taskId}/submit?corrected_value=${encodeURIComponent(value)}`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err) || `Failed to submit resolution: ${response.status}`);
    }
    const body = await response.json();
    return unwrapV3(body);
  },

  getEventsUrl: (): string => {
    const token = localStorage.getItem('ssiar_token');
    return `${API_BASE}/system/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
};

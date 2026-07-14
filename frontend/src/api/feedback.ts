import { API_BASE, authHeaders, extractErrorMessage, unwrapV3 } from './client';
import type { FeedbackItem, FeedbackMessage } from './types';

export const feedbackApi = {
  createFeedback: async (subject: string, message: string, attachment?: File): Promise<{ id: number; created_at: string }> => {
    const formData = new FormData();
    formData.append('subject', subject);
    formData.append('message', message);
    if (attachment) formData.append('attachment', attachment);
    const res = await fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ id: number; created_at: string }>(await res.json());
  },

  listFeedback: async (params?: { status?: string; limit?: number; offset?: number }): Promise<{ items: FeedbackItem[]; total: number }> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const res = await fetch(`${API_BASE}/feedback?${qs.toString()}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ items: FeedbackItem[]; total: number }>(await res.json());
  },

  getFeedback: async (id: number): Promise<FeedbackItem> => {
    const res = await fetch(`${API_BASE}/feedback/${id}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<FeedbackItem>(await res.json());
  },

  updateFeedbackStatus: async (id: number, status: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/feedback/${id}/status?status=${encodeURIComponent(status)}`, {
      method: 'PUT',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    await res.json();
  },

  getMessages: async (feedbackId: number): Promise<{ messages: FeedbackMessage[] }> => {
    const res = await fetch(`${API_BASE}/feedback/${feedbackId}/messages`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ messages: FeedbackMessage[] }>(await res.json());
  },

  addMessage: async (feedbackId: number, message: string, attachment?: File): Promise<{ id: number; created_at: string }> => {
    const formData = new FormData();
    formData.append('message', message);
    if (attachment) formData.append('attachment', attachment);
    const res = await fetch(`${API_BASE}/feedback/${feedbackId}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(extractErrorMessage(err));
    }
    return unwrapV3<{ id: number; created_at: string }>(await res.json());
  },

  attachmentUrl: (filename: string): string => {
    const token = localStorage.getItem('ssiar_token');
    return `${API_BASE}/feedback/attachments/${filename}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
};

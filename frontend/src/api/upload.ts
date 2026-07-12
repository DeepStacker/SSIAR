import { API_BASE, authHeaders } from './client';

export const uploadApi = {
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
};

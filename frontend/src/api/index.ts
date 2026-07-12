export * from './types';
export { API_BASE, isTokenExpired, clearAuth, scheduleTokenRefresh, authHeaders, clearApiCache, invalidateCache, unwrapV3, extractErrorMessage, redirectToLogin, getAndClearReferrer } from './client';
export { documentsApi } from './documents';
export { uploadApi } from './upload';
export { exportApi } from './export';
export { analyticsApi } from './analytics';

import { documentsApi } from './documents';
import { uploadApi } from './upload';
import { exportApi } from './export';
import { analyticsApi } from './analytics';

export const api = {
  ...documentsApi,
  ...uploadApi,
  ...exportApi,
  ...analyticsApi,
};

export * from './types';
export { API_BASE, isTokenExpired, clearAuth, scheduleTokenRefresh, authHeaders, clearApiCache, invalidateCache, unwrapV3, extractErrorMessage, redirectToLogin, getAndClearReferrer } from './client';
export { documentsApi } from './documents';
export { uploadApi } from './upload';
export { exportApi } from './export';
export { analyticsApi } from './analytics';
export { usersApi } from './users';
export { feedbackApi } from './feedback';
export { trackingApi } from './tracking';

import { documentsApi } from './documents';
import { uploadApi } from './upload';
import { exportApi } from './export';
import { analyticsApi } from './analytics';
import { usersApi } from './users';
import { feedbackApi } from './feedback';
import { trackingApi } from './tracking';

export const api = {
  ...documentsApi,
  ...uploadApi,
  ...exportApi,
  ...analyticsApi,
  ...usersApi,
  ...feedbackApi,
  ...trackingApi,
};

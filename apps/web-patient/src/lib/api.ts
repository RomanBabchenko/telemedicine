import { createAppApiClient } from '@telemed/web-shared';
import { useAuthStore } from '../stores/auth.store';

export const apiClient = createAppApiClient(useAuthStore, import.meta.env.VITE_API_URL);

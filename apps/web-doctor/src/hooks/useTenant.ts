import { createUseTenant } from '@telemed/web-shared';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

export const useTenant = createUseTenant(useAuthStore, apiClient);

import { createUseAuthConfig } from '@telemed/web-shared';
import { apiClient } from '../lib/api';

export const useAuthConfig = createUseAuthConfig(apiClient);

import { useQuery } from '@tanstack/react-query';
import { authApi } from '@telemed/api-client';
import { apiClient } from '../lib/api';

const auth = authApi(apiClient);

// Reads the platform-wide login kill-switch flags
// (AUTH_DISABLE_LOGIN_DOCTOR / AUTH_DISABLE_LOGIN_PATIENT). Public, fetched
// pre-auth so we can hide login forms outright instead of letting users
// fill them in only to be 403'd. The flags are env-driven and effectively
// constant between requests, so we keep the query cached for a while.
export const useAuthConfig = () =>
  useQuery({
    queryKey: ['auth', 'config'],
    queryFn: () => auth.config(),
    staleTime: 5 * 60_000,
  });

import { useQuery } from '@tanstack/react-query';
import { authApi, type ApiClient } from '@telemed/api-client';

// Reads the platform-wide login kill-switch flags
// (AUTH_DISABLE_LOGIN_DOCTOR / AUTH_DISABLE_LOGIN_PATIENT). Public, fetched
// pre-auth so login forms can be hidden outright instead of letting users
// fill them in only to be 403'd. The flags are env-driven and effectively
// constant between requests, so the query stays cached for a while.
export const createUseAuthConfig = (client: ApiClient) => {
  const auth = authApi(client);
  return () =>
    useQuery({
      queryKey: ['auth', 'config'],
      queryFn: () => auth.config(),
      staleTime: 5 * 60_000,
    });
};

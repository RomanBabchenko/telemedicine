import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokensDto, AuthUserDto } from '@telemed/shared-types';

interface AuthState {
  user: AuthUserDto | null;
  tokens: AuthTokensDto | null;
  tenantId: string | null;
  setSession: (session: { user: AuthUserDto; tokens: AuthTokensDto }) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      tenantId: null,
      setSession: (session) =>
        set({ user: session.user, tokens: session.tokens, tenantId: session.user.tenantId }),
      logout: () => set({ user: null, tokens: null, tenantId: null }),
    }),
    { name: 'telemed-admin-auth' },
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthTokensDto, AuthUserDto } from '@telemed/shared-types';

export interface AuthState {
  user: AuthUserDto | null;
  tokens: AuthTokensDto | null;
  tenantId: string | null;
  setSession: (session: { user: AuthUserDto; tokens: AuthTokensDto }) => void;
  logout: () => void;
}

// One auth store per app — the persist key namespaces localStorage so a
// doctor and a patient session can coexist in the same browser.
export const createAuthStore = (persistKey: string) =>
  create<AuthState>()(
    persist(
      (set) => ({
        user: null,
        tokens: null,
        tenantId: null,
        setSession: (session) =>
          set({ user: session.user, tokens: session.tokens, tenantId: session.user.tenantId }),
        logout: () => set({ user: null, tokens: null, tenantId: null }),
      }),
      { name: persistKey },
    ),
  );

export type AuthStore = ReturnType<typeof createAuthStore>;


import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';
import type { AuthSession, AgentPublic, LoginInput, RegisterInput } from '../../shared/types';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  agent: AgentPublic | null;
  company: { _id: string; name: string } | null;
  session: AuthSession | null;
  error: string | null;
  
  // Actions
  login: (data: LoginInput) => Promise<boolean>;
  register: (data: RegisterInput) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      isLoading: false,
      agent: null,
      company: null,
      session: null,
      error: null,

      login: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const result = await api.auth.login(data);
          if (result.success && result.data) {
            set({
              isAuthenticated: true,
              agent: result.data.agent,
              company: result.data.company,
              session: result.data.session,
              isLoading: false,
            });
            return true;
          } else {
            set({ error: result.error || 'Login failed', isLoading: false });
            return false;
          }
        } catch {
          set({ error: 'An unexpected error occurred', isLoading: false });
          return false;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const result = await api.auth.register(data);
          if (result.success && result.data) {
            set({
              isAuthenticated: true,
              agent: result.data.agent,
              company: result.data.company,
              session: result.data.session,
              isLoading: false,
            });
            return true;
          } else {
            set({ error: result.error || 'Registration failed', isLoading: false });
            return false;
          }
        } catch {
          set({ error: 'An unexpected error occurred', isLoading: false });
          return false;
        }
      },

      logout: async () => {
        const { session } = get();
        try {
          await api.auth.logout(session?._id);
        } finally {
          set({
            isAuthenticated: false,
            agent: null,
            company: null,
            session: null,
            error: null,
          });
        }
      },

      checkSession: async () => {
        const { session } = get();
        try {
          // If we have a local session, try to validate it with backend
          const sessionId = session ? session._id : undefined;

          // If no sessionId locally, assume not authenticated (unless we want to support magic implicit sessions which we don't anymore)
          if (!sessionId) {
              // If we thought we were authenticated but have no session ID, reset
              if (get().isAuthenticated) {
                  set({ isAuthenticated: false, session: null, agent: null, company: null });
              }
              return;
          }

          const result = await api.auth.getSession(sessionId);
          if (result.success && result.data) {
            set({
              isAuthenticated: true,
              session: result.data,
            });
          } else {
            // Session invalid or expired
            set({ isAuthenticated: false, session: null, agent: null, company: null });
          }
        } catch {
          set({ isAuthenticated: false, session: null, agent: null, company: null });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        agent: state.agent,
        company: state.company,
        session: state.session, // Persist session now!
      }),
    }
  )
);

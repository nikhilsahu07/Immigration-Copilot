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
        } catch (error) {
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
        } catch (error) {
          set({ error: 'An unexpected error occurred', isLoading: false });
          return false;
        }
      },

      logout: async () => {
        try {
          await api.auth.logout();
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
        try {
          const result = await api.auth.getSession();
          if (result.success && result.data) {
            set({
              isAuthenticated: true,
              session: result.data,
            });
          } else {
            set({ isAuthenticated: false, session: null });
          }
        } catch {
          set({ isAuthenticated: false, session: null });
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
      }),
    }
  )
);

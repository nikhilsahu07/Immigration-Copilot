
import { create } from 'zustand';
import { api } from '../lib/api';
import type { AgentPublic, CreateAgentInput, UpdateAgentInput } from '../../shared/types';

interface AgentState {
  agents: AgentPublic[];
  isLoading: boolean;
  error: string | null;
  total: number;
  page: number;
  totalPages: number;

  fetchAgents: (page?: number) => Promise<void>;
  createAgent: (data: CreateAgentInput) => Promise<boolean>;
  updateAgent: (id: string, data: UpdateAgentInput) => Promise<boolean>;
  deleteAgent: (id: string) => Promise<boolean>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  isLoading: false,
  error: null,
  total: 0,
  page: 1,
  totalPages: 1,

  fetchAgents: async (page = 1) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.agent.list({ page, limit: 10 });
      if (result.success && result.data) {
        set({
          agents: result.data.items,
          total: result.data.total,
          page: result.data.page,
          totalPages: result.data.totalPages || 1,
          isLoading: false,
        });
      } else {
        set({ error: result.error || 'Failed to fetch agents', isLoading: false });
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
    }
  },

  createAgent: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.agent.create(data);
      if (result.success) {
        // Refresh list
        await get().fetchAgents(get().page);
        return true;
      } else {
        set({ error: result.error || 'Failed to create agent', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  updateAgent: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.agent.update({ id, data });
      if (result.success) {
        // Refresh list
        await get().fetchAgents(get().page);
        return true;
      } else {
        set({ error: result.error || 'Failed to update agent', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  deleteAgent: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.agent.delete({ id });
      if (result.success) {
        // Refresh list
        await get().fetchAgents(get().page);
        return true;
      } else {
        set({ error: result.error || 'Failed to delete agent', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },
}));

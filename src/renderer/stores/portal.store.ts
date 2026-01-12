import { create } from 'zustand';
import { api } from '../lib/api';
import type { Portal, CreatePortalInput, UpdatePortalInput } from '../../shared/types';

interface PortalState {
  portals: Portal[];
  selectedPortal: Portal | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPortals: () => Promise<void>;
  getPortal: (id: string) => Promise<Portal | null>;
  createPortal: (data: CreatePortalInput) => Promise<Portal | null>;
  updatePortal: (id: string, data: UpdatePortalInput) => Promise<Portal | null>;
  deletePortal: (id: string) => Promise<boolean>;
  setSelectedPortal: (portal: Portal | null) => void;
  clearError: () => void;
}

export const usePortalStore = create<PortalState>((set, get) => ({
  portals: [],
  selectedPortal: null,
  isLoading: false,
  error: null,

  fetchPortals: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.portal.list();
      if (result.success && result.data) {
        set({ portals: result.data, isLoading: false });
      } else {
        set({ error: result.error || 'Failed to fetch portals', isLoading: false });
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
    }
  },

  getPortal: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.portal.get({ id });
      if (result.success && result.data) {
        set({ selectedPortal: result.data, isLoading: false });
        return result.data;
      } else {
        set({ error: result.error || 'Failed to get portal', isLoading: false });
        return null;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return null;
    }
  },

  createPortal: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.portal.create(data);
      if (result.success && result.data) {
        // Refresh list
        get().fetchPortals();
        set({ isLoading: false });
        return result.data;
      } else {
        set({ error: result.error || 'Failed to create portal', isLoading: false });
        return null;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return null;
    }
  },

  updatePortal: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.portal.update({ id, data });
      if (result.success && result.data) {
        // Update in list
        const portals = get().portals.map((p) =>
          p._id === id ? { ...p, ...result.data } : p
        );
        set({ portals, isLoading: false });

        // Update selected if same
        if (get().selectedPortal?._id === id) {
          set({ selectedPortal: result.data });
        }

        return result.data;
      } else {
        set({ error: result.error || 'Failed to update portal', isLoading: false });
        return null;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return null;
    }
  },

  deletePortal: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.portal.delete({ id });
      if (result.success) {
        // Remove from list
        const portals = get().portals.filter((p) => p._id !== id);
        set({ portals, isLoading: false });

        // Clear selected if same
        if (get().selectedPortal?._id === id) {
          set({ selectedPortal: null });
        }

        return true;
      } else {
        set({ error: result.error || 'Failed to delete portal', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  setSelectedPortal: (portal) => set({ selectedPortal: portal }),
  clearError: () => set({ error: null }),
}));

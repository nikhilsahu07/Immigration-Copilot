import { create } from 'zustand';
import { api } from '../lib/api';
import type { ClientWithDocumentCount, CreateClientInput, UpdateClientInput, PaginationParams } from '../../shared/types';

interface ClientState {
  clients: ClientWithDocumentCount[];
  selectedClient: ClientWithDocumentCount | null;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  searchQuery: string;
  statusFilter: string;

  // Actions
  fetchClients: (params?: PaginationParams & { search?: string; status?: string }) => Promise<void>;
  getClient: (id: string) => Promise<ClientWithDocumentCount | null>;
  createClient: (data: CreateClientInput) => Promise<ClientWithDocumentCount | null>;
  updateClient: (id: string, data: UpdateClientInput) => Promise<ClientWithDocumentCount | null>;
  deleteClient: (id: string) => Promise<boolean>;
  setSelectedClient: (client: ClientWithDocumentCount | null) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (status: string) => void;
  clearError: () => void;
}

export const useClientStore = create<ClientState>((set, get) => ({
  clients: [],
  selectedClient: null,
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },
  searchQuery: '',
  statusFilter: '',

  fetchClients: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { searchQuery, statusFilter, pagination } = get();
      const result = await api.client.list({
        page: params?.page || pagination.page,
        pageSize: params?.pageSize || pagination.pageSize,
        search: params?.search ?? searchQuery,
        status: params?.status ?? statusFilter,
        sortBy: params?.sortBy || 'createdAt',
        sortOrder: params?.sortOrder || 'desc',
      });

      if (result.success && result.data) {
        set({
          clients: result.data.data,
          pagination: {
            page: result.data.page,
            pageSize: result.data.pageSize,
            total: result.data.total,
            totalPages: result.data.totalPages,
          },
          isLoading: false,
        });
      } else {
        set({ error: result.error || 'Failed to fetch clients', isLoading: false });
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
    }
  },

  getClient: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.client.get({ id });
      if (result.success && result.data) {
        set({ selectedClient: result.data, isLoading: false });
        return result.data;
      } else {
        set({ error: result.error || 'Failed to get client', isLoading: false });
        return null;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return null;
    }
  },

  createClient: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.client.create(data);
      if (result.success && result.data) {
        // Refresh list
        get().fetchClients();
        set({ isLoading: false });
        return result.data as ClientWithDocumentCount;
      } else {
        set({ error: result.error || 'Failed to create client', isLoading: false });
        return null;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return null;
    }
  },

  updateClient: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.client.update({ id, data });
      if (result.success && result.data) {
        // Update in list
        const clients = get().clients.map((c) =>
          c._id === id ? { ...c, ...result.data } : c
        );
        set({ clients, isLoading: false });
        
        // Update selected if same
        if (get().selectedClient?._id === id) {
          set({ selectedClient: { ...get().selectedClient, ...result.data } as ClientWithDocumentCount });
        }
        
        return result.data as ClientWithDocumentCount;
      } else {
        set({ error: result.error || 'Failed to update client', isLoading: false });
        return null;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return null;
    }
  },

  deleteClient: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.client.delete({ id });
      if (result.success) {
        // Remove from list
        const clients = get().clients.filter((c) => c._id !== id);
        set({ clients, isLoading: false });
        
        // Clear selected if same
        if (get().selectedClient?._id === id) {
          set({ selectedClient: null });
        }
        
        return true;
      } else {
        set({ error: result.error || 'Failed to delete client', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  setSelectedClient: (client) => set({ selectedClient: client }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setStatusFilter: (status) => set({ statusFilter: status }),
  clearError: () => set({ error: null }),
}));

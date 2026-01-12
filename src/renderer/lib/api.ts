// Type definitions for the Electron API exposed via preload

import type { Result, PaginatedResult, PaginationParams } from '../../shared/types';
import type { 
  LoginInput, 
  RegisterInput, 
  LoginResponse,
  AuthSession,
  Client,
  ClientWithDocumentCount,
  CreateClientInput,
  UpdateClientInput,
  DocumentWithPresignedUrl,
  UploadDocumentInput,
  Extraction,
  CreateExtractionInput,
  ApproveExtractionInput,
  RejectExtractionInput,
  Portal,
  CreatePortalInput,
  UpdatePortalInput,
  AutomationJob,
  CreateJobInput,
  FormMapping,
  AutomationState,
} from '../../shared/types';

export interface DashboardStats {
  totalClients: number;
  pendingExtractions: number;
  completedJobs: number;
  activePortals: number;
}

export interface ActivityItem {
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

export interface ChatMessage {
  _id: string;
  companyId: string;
  agentId: string;
  clientId: string;
  jobId?: string;
  role: 'user' | 'ai' | 'system';
  content: string;
  pageUrl?: string;
  pageNumber?: number;
  createdAt: Date;
}

export interface ElectronAPI {
  dashboard: {
    getStats: () => Promise<Result<DashboardStats>>;
    getActivity: (params?: { limit?: number }) => Promise<Result<ActivityItem[]>>;
  };
  auth: {
    register: (data: RegisterInput) => Promise<Result<LoginResponse>>;
    login: (data: LoginInput) => Promise<Result<LoginResponse>>;
    logout: () => Promise<Result<void>>;
    getSession: () => Promise<Result<AuthSession | null>>;
  };
  company: {
    get: (data: { id: string }) => Promise<Result<unknown>>;
    update: (data: { id: string; data: unknown }) => Promise<Result<unknown>>;
  };
  client: {
    list: (params: PaginationParams & { search?: string; status?: string }) => Promise<Result<PaginatedResult<ClientWithDocumentCount>>>;
    get: (data: { id: string }) => Promise<Result<ClientWithDocumentCount>>;
    create: (data: CreateClientInput) => Promise<Result<Client>>;
    update: (data: { id: string; data: UpdateClientInput }) => Promise<Result<Client>>;
    delete: (data: { id: string }) => Promise<Result<void>>;
  };
  document: {
    list: (data: { clientId: string }) => Promise<Result<DocumentWithPresignedUrl[]>>;
    upload: (data: UploadDocumentInput) => Promise<Result<DocumentWithPresignedUrl>>;
    delete: (data: { id: string }) => Promise<Result<void>>;
    getPresignedUrl: (data: { id: string }) => Promise<Result<{ url: string; expiresAt: Date }>>;
  };
  extraction: {
    list: (data: { clientId: string }) => Promise<Result<Extraction[]>>;
    get: (data: { id: string }) => Promise<Result<Extraction>>;
    create: (data: CreateExtractionInput) => Promise<Result<Extraction>>;
    update: (data: { id: string; data: { extractedData?: unknown } }) => Promise<Result<Extraction>>;
    approve: (data: { id: string; data?: ApproveExtractionInput }) => Promise<Result<Extraction>>;
    reject: (data: { id: string; data: RejectExtractionInput }) => Promise<Result<Extraction>>;
    delete: (data: { id: string }) => Promise<Result<void>>;
  };
  portal: {
    list: () => Promise<Result<Portal[]>>;
    get: (data: { id: string }) => Promise<Result<Portal>>;
    create: (data: CreatePortalInput) => Promise<Result<Portal>>;
    update: (data: { id: string; data: UpdatePortalInput }) => Promise<Result<Portal>>;
    delete: (data: { id: string }) => Promise<Result<void>>;
  };
  chat: {
    list: (data: { clientId: string }) => Promise<Result<ChatMessage[]>>;
    create: (data: { clientId: string; content: string; role: string; jobId?: string }) => Promise<Result<ChatMessage>>;
  };
  automation: {
    start: (data: CreateJobInput) => Promise<Result<AutomationJob>>;
    stop: () => Promise<Result<void>>;
    pause: () => Promise<Result<void>>;
    resume: () => Promise<Result<void>>;
    approveMapping: (data: { mapping: FormMapping }) => Promise<Result<void>>;
    rejectMapping: (data: { reason: string }) => Promise<Result<void>>;
    submitForm: () => Promise<Result<void>>;
    submitOtp: (data: { otp: string }) => Promise<Result<void>>;
    resumeAfterCaptcha: () => Promise<Result<void>>;
    executeAction: (data: { actionIndex: number }) => Promise<Result<void>>;
    getState: () => Promise<Result<AutomationState>>;
    getHistory: (params: PaginationParams) => Promise<Result<PaginatedResult<AutomationJob>>>;
  };
  browserView: {
    load: (data: { url: string }) => Promise<Result<void>>;
    show: () => Promise<Result<void>>;
    hide: () => Promise<Result<void>>;
    resize: (data: { width: number }) => Promise<Result<void>>;
    close: () => Promise<Result<void>>;
  };
  events: {
    onStatusUpdate: (callback: (data: { message: string; progress: number }) => void) => () => void;
    onFormPreview: (callback: (data: FormMapping) => void) => () => void;
    onCaptchaDetected: (callback: (data: { type: string }) => void) => () => void;
    onOtpRequired: (callback: (data: { fieldSelector: string }) => void) => () => void;
    onJobCompleted: (callback: (data: { jobId: string; success: boolean }) => void) => () => void;
    onPageChanged: (callback: (data: { page: number; total: number }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const api = window.electronAPI;

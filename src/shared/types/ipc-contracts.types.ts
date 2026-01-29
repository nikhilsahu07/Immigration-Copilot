// IPC Contract Types - Request/Response types for Electron IPC

import { Company, UpdateCompanyInput } from './company.types';
import {
  AgentPublic,
  CreateAgentInput,
  LoginInput,
  RegisterInput,
  LoginResponse,
  UpdateAgentInput,
} from './agent.types';
import {
  Client,
  CreateClientInput,
  UpdateClientInput,
  ClientWithDocumentCount,
} from './client.types';
import {
  UploadDocumentInput,
  DocumentWithPresignedUrl,
} from './document.types';
import {
  Extraction,
  CreateExtractionInput,
  ApproveExtractionInput,
  RejectExtractionInput,
} from './extraction.types';
import { Portal, CreatePortalInput, UpdatePortalInput } from './portal.types';
import {
  AutomationJob,
  CreateJobInput,
  FormMapping,
  AutomationState,
} from './automation.types';
import { Result, PaginatedResult, PaginationParams } from './common.types';

// Auth IPC
export interface AuthIPC {
  register: {
    request: RegisterInput;
    response: Result<LoginResponse>;
  };
  login: {
    request: LoginInput;
    response: Result<LoginResponse>;
  };
  logout: {
    request: void;
    response: Result<void>;
  };
  getSession: {
    request: void;
    response: Result<LoginResponse | null>;
  };
}

// Company IPC
export interface CompanyIPC {
  get: {
    request: { id: string };
    response: Result<Company>;
  };
  update: {
    request: { id: string; data: UpdateCompanyInput };
    response: Result<Company>;
  };
}

// Agent IPC
export interface AgentIPC {
  list: {
    request: PaginationParams;
    response: PaginatedResult<AgentPublic>;
  };
  get: {
    request: { id: string };
    response: Result<AgentPublic>;
  };
  create: {
    request: CreateAgentInput;
    response: Result<AgentPublic>;
  };
  update: {
    request: { id: string; data: UpdateAgentInput };
    response: Result<AgentPublic>;
  };
  delete: {
    request: { id: string };
    response: Result<void>;
  };
}

// Client IPC
export interface ClientIPC {
  list: {
    request: PaginationParams & { search?: string; status?: string };
    response: PaginatedResult<ClientWithDocumentCount>;
  };
  get: {
    request: { id: string };
    response: Result<ClientWithDocumentCount>;
  };
  create: {
    request: CreateClientInput;
    response: Result<Client>;
  };
  update: {
    request: { id: string; data: UpdateClientInput };
    response: Result<Client>;
  };
  delete: {
    request: { id: string };
    response: Result<void>;
  };
}

// Document IPC
export interface DocumentIPC {
  list: {
    request: { clientId: string };
    response: Result<DocumentWithPresignedUrl[]>;
  };
  upload: {
    request: UploadDocumentInput;
    response: Result<DocumentWithPresignedUrl>;
  };
  delete: {
    request: { id: string };
    response: Result<void>;
  };
  getPresignedUrl: {
    request: { id: string };
    response: Result<{ url: string; expiresAt: Date }>;
  };
}

// Extraction IPC
export interface ExtractionIPC {
  list: {
    request: { clientId: string };
    response: Result<Extraction[]>;
  };
  get: {
    request: { id: string };
    response: Result<Extraction>;
  };
  create: {
    request: CreateExtractionInput;
    response: Result<Extraction>;
  };
  approve: {
    request: { id: string; data?: ApproveExtractionInput };
    response: Result<Extraction>;
  };
  reject: {
    request: { id: string; data: RejectExtractionInput };
    response: Result<Extraction>;
  };
  delete: {
    request: { id: string };
    response: Result<void>;
  };
}

// Portal IPC
export interface PortalIPC {
  list: {
    request: void;
    response: Result<Portal[]>;
  };
  get: {
    request: { id: string };
    response: Result<Portal>;
  };
  create: {
    request: CreatePortalInput;
    response: Result<Portal>;
  };
  update: {
    request: { id: string; data: UpdatePortalInput };
    response: Result<Portal>;
  };
  delete: {
    request: { id: string };
    response: Result<void>;
  };
}

// Automation IPC
export interface AutomationIPC {
  start: {
    request: CreateJobInput;
    response: Result<AutomationJob>;
  };
  stop: {
    request: void;
    response: Result<void>;
  };
  pause: {
    request: void;
    response: Result<void>;
  };
  resume: {
    request: void;
    response: Result<void>;
  };
  approveMapping: {
    request: { mapping: FormMapping };
    response: Result<void>;
  };
  rejectMapping: {
    request: { reason: string };
    response: Result<void>;
  };
  submitForm: {
    request: void;
    response: Result<void>;
  };
  submitOtp: {
    request: { otp: string };
    response: Result<void>;
  };
  resumeAfterCaptcha: {
    request: void;
    response: Result<void>;
  };
  getState: {
    request: void;
    response: Result<AutomationState>;
  };
  getJobHistory: {
    request: PaginationParams;
    response: PaginatedResult<AutomationJob>;
  };
  retryFilling: {
    request: void;
    response: Result<void>;
  };
  canRetry: {
    request: void;
    response: Result<boolean>;
  };
}

// BrowserView IPC
export interface BrowserViewIPC {
  load: {
    request: { url: string };
    response: Result<void>;
  };
  show: {
    request: void;
    response: Result<void>;
  };
  hide: {
    request: void;
    response: Result<void>;
  };
  resize: {
    request: { width: number };
    response: Result<void>;
  };
}

// All IPC Contracts
export interface IPCContracts {
  auth: AuthIPC;
  company: CompanyIPC;
  agent: AgentIPC;
  client: ClientIPC;
  document: DocumentIPC;
  extraction: ExtractionIPC;
  portal: PortalIPC;
  automation: AutomationIPC;
  browserView: BrowserViewIPC;
}

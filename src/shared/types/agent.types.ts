import { BaseEntity, WithCompany } from './common.types';

export type AgentRole = 'admin' | 'agent';

export interface Agent extends BaseEntity, WithCompany {
  name: string;
  email: string;
  passwordHash: string;
  role: AgentRole;
  isActive: boolean;
  lastLoginAt?: Date;
  avatar?: string;
}

export interface AgentPublic {
  _id: string;
  companyId: string;
  name: string;
  email: string;
  role: AgentRole;
  isActive: boolean;
  lastLoginAt?: Date;
  avatar?: string;
  createdAt: Date;
}

export interface CreateAgentInput {
  companyId: string;
  name: string;
  email: string;
  password: string;
  role?: AgentRole;
}

export interface UpdateAgentInput {
  name?: string;
  email?: string;
  password?: string;
  role?: AgentRole;
  isActive?: boolean;
  avatar?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  company: {
    name: string;
    country: string;
    email: string;
    phone: string;
  };
  agent: {
    name: string;
    email: string;
    password: string;
  };
}

export interface AuthSession {
  _id: string;
  agentId: string;
  companyId: string;
  email: string;
  name: string;
  role: AgentRole;
  expiresAt: Date;
}

export interface LoginResponse {
  agent: AgentPublic;
  company: {
    _id: string;
    name: string;
  };
  session: AuthSession;
}

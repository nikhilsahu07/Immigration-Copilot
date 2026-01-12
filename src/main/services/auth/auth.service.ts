
import bcrypt from 'bcrypt';
import { companyRepository, agentRepository, auditLogRepository, sessionRepository } from '../../database/repositories';
import { RegisterInput, LoginInput, LoginResponse, AuthSession } from '../../../shared/types';
import { createError } from '../../core/error-handler';
import { ERROR_CODES } from '../../../shared/constants';
import { logger } from '../../core/logger';
import { getEnv } from '../../config';

const BCRYPT_ROUNDS = 10;

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

export class AuthService {
  async register(input: RegisterInput): Promise<LoginResponse> {
    const { company: companyInput, agent: agentInput } = input;

    // Check if company email exists
    const existingCompany = await companyRepository.findByEmail(companyInput.email);
    if (existingCompany) {
      throw createError(ERROR_CODES.AUTH_EMAIL_EXISTS, 'Company email already registered');
    }

    // Check if agent email exists
    const existingAgent = await agentRepository.findByEmail(agentInput.email);
    if (existingAgent) {
      throw createError(ERROR_CODES.AUTH_EMAIL_EXISTS, 'Agent email already registered');
    }

    // Create company
    const company = await companyRepository.create(companyInput);

    // Hash password and create agent
    const passwordHash = await bcrypt.hash(agentInput.password, BCRYPT_ROUNDS);
    const agent = await agentRepository.create({
      companyId: company._id,
      name: agentInput.name,
      email: agentInput.email.toLowerCase(),
      password: agentInput.password,
      role: 'admin',
      passwordHash,
    });

    // Create session
    const session = await this.createSession(agent._id, company._id, agent.email, agent.name, agent.role);

    // Log audit
    await auditLogRepository.log(
      company._id,
      agent._id,
      'LOGIN',
      'agent',
      agent._id,
      { action: 'register' }
    );

    logger.info(`New company registered: ${company.name}`);

    return {
      agent: {
        _id: agent._id,
        companyId: agent.companyId,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        isActive: agent.isActive,
        createdAt: agent.createdAt,
      },
      company: {
        _id: company._id,
        name: company.name,
      },
      session,
    };
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const { email, password } = input;

    // Find agent by email
    const agent = await agentRepository.findByEmail(email.toLowerCase());
    if (!agent) {
      throw createError(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    // Check if agent is active
    if (!agent.isActive) {
      throw createError(ERROR_CODES.AUTH_UNAUTHORIZED, 'Account is deactivated');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, agent.passwordHash);
    if (!isValid) {
      throw createError(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    // Get company
    const company = await companyRepository.findById(agent.companyId);
    if (!company) {
      throw createError(ERROR_CODES.AUTH_COMPANY_NOT_FOUND);
    }

    // Update last login
    await agentRepository.updateLastLogin(agent._id);

    // Create session
    const session = await this.createSession(agent._id, company._id, agent.email, agent.name, agent.role);

    // Log audit
    await auditLogRepository.log(
      company._id,
      agent._id,
      'LOGIN',
      'agent',
      agent._id
    );

    logger.info(`Agent logged in: ${agent.email}`);

    return {
      agent: {
        _id: agent._id,
        companyId: agent.companyId,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        isActive: agent.isActive,
        lastLoginAt: new Date(),
        createdAt: agent.createdAt,
      },
      company: {
        _id: company._id,
        name: company.name,
      },
      session,
    };
  }

  async logout(sessionId: string): Promise<void> {
    const session = await sessionRepository.findById(sessionId);
    if (session) {
      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'LOGOUT',
        'agent',
        session.agentId
      );
      await sessionRepository.delete(sessionId);
      logger.info(`Agent logged out: ${session.email}`);
    }
  }

  async getSession(sessionId: string): Promise<AuthSession | null> {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return null;
    }

    // Check if expired (double check in case TTL hasn't run yet)
    if (new Date() > session.expiresAt) {
      await sessionRepository.delete(sessionId);
      return null;
    }

    return session;
  }

  private async createSession(
    agentId: string,
    companyId: string,
    email: string,
    name: string,
    role: 'admin' | 'agent'
  ): Promise<AuthSession> {
    const env = getEnv();
    const expiryDays = parseInt(env.SESSION_EXPIRY_DAYS, 10) || 7;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    const sessionId = generateSessionId();

    const session: AuthSession = {
      _id: sessionId,
      agentId,
      companyId,
      email,
      name,
      role,
      expiresAt,
    };

    await sessionRepository.create(session);
    return session;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

export const authService = new AuthService();

// Current session (per window) - keeping this for quick access in same session
let currentSession: { sessionId: string; session: AuthSession } | null = null;

export function setCurrentSession(sessionId: string, session: AuthSession): void {
  currentSession = { sessionId, session };
}

export function getCurrentSession(): AuthSession | null {
  return currentSession?.session || null;
}

export function clearCurrentSession(): void {
  currentSession = null;
}

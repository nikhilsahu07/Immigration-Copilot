import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import { extractionRepository, documentRepository, auditLogRepository } from '../../database/repositories';
import { geminiService } from '../../services/ai';
import { downloadFromS3 } from '../../storage/s3-client';
import { createExtractionSchema, approveExtractionSchema, rejectExtractionSchema } from '../../../shared/schemas';
import { handleError, success, createError } from '../../core/error-handler';
import { ERROR_CODES } from '../../../shared/constants';
import { getCurrentSession } from '../../services/auth';
import { logger } from '../../core/logger';
import pdfParse from 'pdf-parse';

function requireAuth() {
  const session = getCurrentSession();
  if (!session) {
    throw createError(ERROR_CODES.AUTH_UNAUTHORIZED);
  }
  return session;
}

export function registerExtractionHandlers(): void {
  // List extractions by client
  ipcMain.handle(IPC_CHANNELS.EXTRACTION_LIST, async (_event, { clientId }) => {
    try {
      const session = requireAuth();
      const extractions = await extractionRepository.findByClient(clientId, session.companyId);
      return success(extractions);
    } catch (error) {
      logger.error('List extractions error:', error);
      return handleError(error);
    }
  });

  // Get extraction
  ipcMain.handle(IPC_CHANNELS.EXTRACTION_GET, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const extraction = await extractionRepository.findById(id, session.companyId);
      if (!extraction) {
        throw createError(ERROR_CODES.EXTRACTION_NOT_FOUND);
      }
      return success(extraction);
    } catch (error) {
      logger.error('Get extraction error:', error);
      return handleError(error);
    }
  });

  // Create extraction (trigger AI)
  ipcMain.handle(IPC_CHANNELS.EXTRACTION_CREATE, async (_event, data) => {
    try {
      const session = requireAuth();
      const validated = createExtractionSchema.parse(data);

      // Get documents
      const documents = await documentRepository.findByIds(validated.documentIds, session.companyId);
      if (documents.length === 0) {
        throw createError(ERROR_CODES.EXTRACTION_NO_DOCUMENTS);
      }

      // Process documents for Gemini
      const geminiDocs = await Promise.all(
        documents.map(async (doc) => {
          if (doc.fileType === 'pdf') {
            // Download and parse PDF
            const buffer = await downloadFromS3(doc.s3Key);
            const pdfData = await pdfParse(buffer);
            return {
              type: 'text' as const,
              content: pdfData.text,
              filename: doc.originalName,
            };
          } else {
            // Download image and convert to base64
            const buffer = await downloadFromS3(doc.s3Key);
            return {
              type: 'image' as const,
              content: buffer.toString('base64'),
              mimeType: `image/${doc.fileType}`,
              filename: doc.originalName,
            };
          }
        })
      );

      // Call Gemini for extraction
      const geminiResult = await geminiService.extractData({
        clientInfo: { name: 'Client' }, // Would be fetched from client record
        documents: geminiDocs,
        customPrompt: validated.customPrompt,
      });

      if (!geminiResult.success || !geminiResult.data) {
        throw createError(ERROR_CODES.EXTRACTION_AI_ERROR, geminiResult.error);
      }

      // Save extraction
      const extraction = await extractionRepository.create(
        session.companyId,
        session.agentId,
        validated,
        geminiResult.data,
        geminiResult.processingTime,
        geminiResult.tokenCount?.total
      );

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'EXTRACTION_CREATED',
        'extraction',
        extraction._id,
        { clientId: validated.clientId, documentCount: validated.documentIds.length }
      );

      return success(extraction);
    } catch (error) {
      logger.error('Create extraction error:', error);
      return handleError(error);
    }
  });

  // Update extraction (edit extracted data)
  ipcMain.handle(IPC_CHANNELS.EXTRACTION_UPDATE, async (_event, { id, data }) => {
    try {
      const session = requireAuth();
      
      const extraction = await extractionRepository.update(
        id,
        session.companyId,
        data
      );

      if (!extraction) {
        throw createError(ERROR_CODES.EXTRACTION_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'EXTRACTION_UPDATED',
        'extraction',
        id
      );

      return success(extraction);
    } catch (error) {
      logger.error('Update extraction error:', error);
      return handleError(error);
    }
  });

  // Approve extraction
  ipcMain.handle(IPC_CHANNELS.EXTRACTION_APPROVE, async (_event, { id, data }) => {
    try {
      const session = requireAuth();
      const validated = data ? approveExtractionSchema.parse(data) : undefined;
      
      const extraction = await extractionRepository.approve(
        id,
        session.companyId,
        session.agentId,
        validated?.extractedData
      );

      if (!extraction) {
        throw createError(ERROR_CODES.EXTRACTION_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'EXTRACTION_APPROVED',
        'extraction',
        id
      );

      return success(extraction);
    } catch (error) {
      logger.error('Approve extraction error:', error);
      return handleError(error);
    }
  });

  // Reject extraction
  ipcMain.handle(IPC_CHANNELS.EXTRACTION_REJECT, async (_event, { id, data }) => {
    try {
      const session = requireAuth();
      const validated = rejectExtractionSchema.parse(data);
      
      const extraction = await extractionRepository.reject(
        id,
        session.companyId,
        validated.rejectionReason
      );

      if (!extraction) {
        throw createError(ERROR_CODES.EXTRACTION_NOT_FOUND);
      }

      await auditLogRepository.log(
        session.companyId,
        session.agentId,
        'EXTRACTION_REJECTED',
        'extraction',
        id,
        { reason: validated.rejectionReason }
      );

      return success(extraction);
    } catch (error) {
      logger.error('Reject extraction error:', error);
      return handleError(error);
    }
  });

  // Delete extraction
  ipcMain.handle(IPC_CHANNELS.EXTRACTION_DELETE, async (_event, { id }) => {
    try {
      const session = requireAuth();
      const deleted = await extractionRepository.delete(id, session.companyId);
      
      if (!deleted) {
        throw createError(ERROR_CODES.EXTRACTION_NOT_FOUND);
      }

      return success(undefined);
    } catch (error) {
      logger.error('Delete extraction error:', error);
      return handleError(error);
    }
  });

  logger.debug('Extraction handlers registered');
}

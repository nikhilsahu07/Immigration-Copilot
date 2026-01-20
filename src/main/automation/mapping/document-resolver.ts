import { logger } from '../../core/logger';

/**
 * Document name to S3 key resolver
 * Handles document lookup for file upload fields
 */
export class DocumentResolver {
  /**
   * Create a lookup map from document name to S3 key
   */
  static createLookupMap(documents: Array<{ originalName: string; s3Key: string }>): Map<string, string> {
    return new Map(documents.map(d => [d.originalName, d.s3Key]));
  }

  /**
   * Resolve a document name to its S3 key
   */
  static resolve(documentName: string, lookup: Map<string, string>): string | null {
    const s3Key = lookup.get(documentName);
    if (s3Key) {
      logger.info(`Resolved document "${documentName}" to S3 key: ${s3Key}`);
      return s3Key;
    }
    logger.warn(`Could not resolve document: ${documentName}`);
    return null;
  }
}

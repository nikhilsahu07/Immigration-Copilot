
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { getPresignedUrl } from '../../storage/s3-client';

export class FileUploadFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      await this.scrollToElement(field.selector);

      // Value should be the S3 Key or URL
      const fileKeyOrUrl = String(field.value);
      if (!fileKeyOrUrl) {
          logger.warn(`No file value provided for ${field.fieldLabel}`);
          return false;
      }

      logger.info(`Processing file upload for ${field.fieldLabel} with key: ${fileKeyOrUrl}`);

      
      let signedUrl = fileKeyOrUrl;
      // If it looks like a key (e.g. companyId/clientId/timestamp_file.pdf) and not a URL
      if (!fileKeyOrUrl.startsWith('http')) {
          try {
             // We need to await the result which is { url, expiresAt }
             const res = await getPresignedUrl(fileKeyOrUrl);
             signedUrl = res.url;
          } catch (e) {
             logger.warn(`Failed to get presigned URL for key ${fileKeyOrUrl}, trying as direct URL`);
          }
      }

      const tempDir = app.getPath('temp');
      const fileName = path.basename(fileKeyOrUrl.split('?')[0]) || 'upload.pdf';
      const localPath = path.join(tempDir, fileName);

      // Download
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
      
      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(localPath, Buffer.from(arrayBuffer));

      // 2. Upload to input
      await this.page.setInputFiles(field.selector, localPath);

      logger.info(`Uploaded file ${fileName} to ${field.selector}`);
      
      // Cleanup? Maybe keep for a bit or let OS handle temp
      // fs.unlinkSync(localPath); 

      return true;
    } catch (error) {
      logger.error(`Failed to fill file upload ${field.fieldLabel}:`, error);
      return false;
    }
  }
}


import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';
import path from 'path';
import fs from 'fs';
// import { app } from 'electron'; // Not available in all contexts, safer to use relative path
import { getPresignedUrl } from '../../storage/s3-client';

export class FileUploadFiller extends BaseFiller {
  async fill(field: AutomatedField): Promise<boolean> {
    try {
      const locator = this.getLocator(field);
      if (!locator) {
        logger.error(`No locator available for file upload ${field.fieldLabel}`);
        return false;
      }

      await this.scrollToLocator(locator);

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
          } catch {
             logger.warn(`Failed to get presigned URL for key ${fileKeyOrUrl}, trying as direct URL`);
          }
      }



      // Use resources/temp instead of system temp to avoid permissions/timeout issues
      const resourcesPath = path.join(process.cwd(), 'resources', 'temp');
      if (!fs.existsSync(resourcesPath)) {
        fs.mkdirSync(resourcesPath, { recursive: true });
      }
      
      const fileName = path.basename(fileKeyOrUrl.split('?')[0]) || 'upload.pdf';
      const localPath = path.join(resourcesPath, fileName);

      // Download
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
      
      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(localPath, Buffer.from(arrayBuffer));

      // 2. Upload to input (using semantic locator)
      await locator.setInputFiles(localPath);

      logger.info(`Uploaded file ${fileName} to ${field.fieldLabel}`);
      
      // Cleanup? Maybe keep for a bit or let OS handle temp
      // fs.unlinkSync(localPath); 

      return true;
    } catch (error) {
      logger.error(`Failed to fill file upload ${field.fieldLabel}:`, error);
      return false;
    }
  }
}

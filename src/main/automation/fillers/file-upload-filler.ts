
import { BaseFiller, AutomatedField } from './base-filler';
import { logger } from '../../core/logger';
import path from 'path';
import fs from 'fs';
// import { app } from 'electron'; // Not available in all contexts, safer to use relative path
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

      // Get signed URL if it's an S3 key
      let signedUrl = fileKeyOrUrl;
      if (!fileKeyOrUrl.startsWith('http')) {
          try {
             const res = await getPresignedUrl(fileKeyOrUrl);
             signedUrl = res.url;
          } catch {
             logger.warn(`Failed to get presigned URL for key ${fileKeyOrUrl}, trying as direct URL`);
          }
      }

      // Download file to local temp
      const resourcesPath = path.join(process.cwd(), 'resources', 'temp');
      if (!fs.existsSync(resourcesPath)) {
        fs.mkdirSync(resourcesPath, { recursive: true });
      }
      
      const fileName = path.basename(fileKeyOrUrl.split('?')[0]) || 'upload.pdf';
      const localPath = path.join(resourcesPath, fileName);

      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
      
      const arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(localPath, Buffer.from(arrayBuffer));

      // Check if the selector is a button (modal trigger) or direct file input
      const elementInfo = await this.page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const tag = el.tagName.toLowerCase();
        const type = el.getAttribute('type');
        return { 
          tag, 
          type,
          isButton: tag === 'button' || tag === 'a' || (tag === 'div' && el.classList.contains('accordion-button')),
          isFileInput: tag === 'input' && type === 'file'
        };
      }, field.selector);

      if (elementInfo?.isButton) {
        // MODAL FLOW: Click button to open upload modal
        logger.info(`Detected button-style upload for ${field.fieldLabel}, clicking to open modal...`);
        await this.page.click(field.selector);
        await this.page.waitForTimeout(1000); // Wait for modal to open

        // Find file input in the modal
        const modalFileInput = await this.findModalFileInput();
        if (modalFileInput) {
          await this.page.setInputFiles(modalFileInput, localPath);
          logger.info(`Set file in modal input: ${modalFileInput}`);
          
          // Wait a bit for file to process
          await this.page.waitForTimeout(500);
          
          // Click upload/confirm button if present
          await this.clickModalUploadButton();
          
          logger.info(`Uploaded file ${fileName} via modal for ${field.fieldLabel}`);
          return true;
        } else {
          // Fallback: set up filechooser handler and click button again
          logger.info(`No modal file input found, trying filechooser approach...`);
          const [fileChooser] = await Promise.all([
            this.page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
            this.page.click(field.selector)
          ]);
          
          if (fileChooser) {
            await fileChooser.setFiles(localPath);
            logger.info(`Uploaded file ${fileName} via filechooser`);
            return true;
          }
        }
      } else if (elementInfo?.isFileInput) {
        // DIRECT FILE INPUT: Standard approach
        await this.page.setInputFiles(field.selector, localPath);
        logger.info(`Uploaded file ${fileName} to ${field.selector}`);
        return true;
      }

      // Last resort: Try setInputFiles anyway
      try {
        await this.page.setInputFiles(field.selector, localPath);
        logger.info(`Uploaded file ${fileName} to ${field.selector} (fallback)`);
        return true;
      } catch (e) {
        logger.error(`Failed to set input files:`, e);
      }

      return false;
    } catch (error) {
      logger.error(`Failed to fill file upload ${field.fieldLabel}:`, error);
      return false;
    }
  }

  /**
   * Find file input element within a visible modal
   */
  private async findModalFileInput(): Promise<string | null> {
    const modalSelectors = [
      '[role="dialog"] input[type="file"]',
      '[aria-modal="true"] input[type="file"]',
      '.modal.show input[type="file"]',
      '.modal[style*="display: block"] input[type="file"]',
      '.ReactModal__Content input[type="file"]',
      '.MuiDialog-root input[type="file"]',
      // Generic: any visible file input
      'input[type="file"]:not([hidden])',
    ];

    for (const selector of modalSelectors) {
      try {
        const count = await this.page.locator(selector).count();
        if (count > 0) {
          const isVisible = await this.page.locator(selector).first().isVisible();
          if (isVisible) {
            return selector;
          }
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Click upload/confirm button in modal after file is selected
   */
  private async clickModalUploadButton(): Promise<boolean> {
    const buttonTexts = ['Upload', 'Confirm', 'Submit', 'Save', 'Done', 'OK'];
    
    for (const text of buttonTexts) {
      try {
        const btn = this.page.getByRole('button', { name: text, exact: false });
        if (await btn.count() > 0 && await btn.first().isVisible()) {
          await btn.first().click();
          logger.info(`Clicked modal button: ${text}`);
          await this.page.waitForTimeout(500);
          return true;
        }
      } catch {
        continue;
      }
    }
    
    // Try generic submit button in modal
    try {
      const modalSubmit = this.page.locator('[role="dialog"] button[type="submit"], .modal button[type="submit"]');
      if (await modalSubmit.count() > 0) {
        await modalSubmit.first().click();
        logger.info('Clicked modal submit button');
        return true;
      }
    } catch {
      // No submit button found
    }
    
    return false;
  }
}


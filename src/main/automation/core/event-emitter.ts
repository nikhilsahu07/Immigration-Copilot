import { IPC_CHANNELS } from '../../../shared/constants';
import { getWindowManager } from '../../index';

/**
 * Event emitter for automation events to renderer process
 * Centralizes all IPC communication
 */
export class EventEmitter {
  /**
   * Emit status update
   */
  static emitStatus(message: string, progress: number): void {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_STATUS_UPDATE, { message, progress });
  }

  /**
   * Emit page changed event
   */
  static emitPageChanged(page: number, total: number): void {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_PAGE_CHANGED, { page, total });
  }

  /**
   * Emit form mapping for approval
   */
  static emitMapping(mapping: Record<string, unknown>): void {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_FORM_PREVIEW, mapping);
  }

  /**
   * Emit CAPTCHA detected event
   */
  static emitCaptchaDetected(type: string): void {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_CAPTCHA_DETECTED, { type });
  }

  /**
   * Emit OTP required event
   */
  static emitOtpRequired(selector: string): void {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_OTP_REQUIRED, { fieldSelector: selector });
  }

  /**
   * Emit manual input required event
   */
  static emitManualInputRequired(emptyFields: { fieldName: string; fieldLabel: string; selector: string }[]): void {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_MANUAL_INPUT_REQUIRED, { 
      fields: emptyFields.map(f => ({
        fieldName: f.fieldName,
        fieldLabel: f.fieldLabel,
        selector: f.selector,
      })),
      message: `${emptyFields.length} field(s) could not be filled automatically. Please fill them manually or provide additional instructions.`
    });
  }

  /**
   * Emit error event
   */
  static emitError(error: { title: string; message: string; type: string; retryAfter?: number }): void {
    const wm = getWindowManager();
    const win = wm?.getMainWindow();
    win?.webContents.send(IPC_CHANNELS.EVENT_ERROR, error);
  }
}

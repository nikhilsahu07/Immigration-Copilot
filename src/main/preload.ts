import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';

// Type-safe IPC invoke wrapper
function createInvoker<TRequest, TResponse>(channel: string) {
  return (request?: TRequest): Promise<TResponse> => {
    return ipcRenderer.invoke(channel, request);
  };
}

// Type-safe IPC event listener wrapper
function createListener<T>(channel: string) {
  return (callback: (data: T) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

// Expose electron API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Dashboard
  dashboard: {
    getStats: createInvoker(IPC_CHANNELS.DASHBOARD_STATS),
    getActivity: createInvoker(IPC_CHANNELS.DASHBOARD_ACTIVITY),
  },

  // Auth
  auth: {
    register: createInvoker(IPC_CHANNELS.AUTH_REGISTER),
    login: createInvoker(IPC_CHANNELS.AUTH_LOGIN),
    logout: createInvoker(IPC_CHANNELS.AUTH_LOGOUT),
    getSession: createInvoker(IPC_CHANNELS.AUTH_GET_SESSION),
  },

  // Company
  company: {
    get: createInvoker(IPC_CHANNELS.COMPANY_GET),
    update: createInvoker(IPC_CHANNELS.COMPANY_UPDATE),
  },

  // Agent
  agent: {
    list: createInvoker(IPC_CHANNELS.AGENT_LIST),
    get: createInvoker(IPC_CHANNELS.AGENT_GET),
    create: createInvoker(IPC_CHANNELS.AGENT_CREATE),
    update: createInvoker(IPC_CHANNELS.AGENT_UPDATE),
    delete: createInvoker(IPC_CHANNELS.AGENT_DELETE),
  },

  // Client
  client: {
    list: createInvoker(IPC_CHANNELS.CLIENT_LIST),
    get: createInvoker(IPC_CHANNELS.CLIENT_GET),
    create: createInvoker(IPC_CHANNELS.CLIENT_CREATE),
    update: createInvoker(IPC_CHANNELS.CLIENT_UPDATE),
    delete: createInvoker(IPC_CHANNELS.CLIENT_DELETE),
  },

  // Document
  document: {
    list: createInvoker(IPC_CHANNELS.DOCUMENT_LIST),
    upload: createInvoker(IPC_CHANNELS.DOCUMENT_UPLOAD),
    delete: createInvoker(IPC_CHANNELS.DOCUMENT_DELETE),
    getPresignedUrl: createInvoker(IPC_CHANNELS.DOCUMENT_GET_URL),
  },

  // Extraction
  extraction: {
    list: createInvoker(IPC_CHANNELS.EXTRACTION_LIST),
    get: createInvoker(IPC_CHANNELS.EXTRACTION_GET),
    create: createInvoker(IPC_CHANNELS.EXTRACTION_CREATE),
    update: createInvoker(IPC_CHANNELS.EXTRACTION_UPDATE),
    approve: createInvoker(IPC_CHANNELS.EXTRACTION_APPROVE),
    reject: createInvoker(IPC_CHANNELS.EXTRACTION_REJECT),
    delete: createInvoker(IPC_CHANNELS.EXTRACTION_DELETE),
  },

  // Portal
  portal: {
    list: createInvoker(IPC_CHANNELS.PORTAL_LIST),
    get: createInvoker(IPC_CHANNELS.PORTAL_GET),
    create: createInvoker(IPC_CHANNELS.PORTAL_CREATE),
    update: createInvoker(IPC_CHANNELS.PORTAL_UPDATE),
    delete: createInvoker(IPC_CHANNELS.PORTAL_DELETE),
  },

  // Chat
  chat: {
    list: createInvoker(IPC_CHANNELS.CHAT_LIST),
    create: createInvoker(IPC_CHANNELS.CHAT_CREATE),
  },
  automation: {
    start: createInvoker(IPC_CHANNELS.AUTOMATION_START),
    stop: createInvoker(IPC_CHANNELS.AUTOMATION_STOP),
    pause: createInvoker(IPC_CHANNELS.AUTOMATION_PAUSE),
    resume: createInvoker(IPC_CHANNELS.AUTOMATION_RESUME),
    approveMapping: createInvoker(IPC_CHANNELS.AUTOMATION_APPROVE_MAPPING),
    rejectMapping: createInvoker(IPC_CHANNELS.AUTOMATION_REJECT_MAPPING),
    submitForm: createInvoker(IPC_CHANNELS.AUTOMATION_SUBMIT_FORM),
    submitOtp: createInvoker(IPC_CHANNELS.AUTOMATION_SUBMIT_OTP),
    resumeAfterCaptcha: createInvoker(IPC_CHANNELS.AUTOMATION_RESUME_AFTER_CAPTCHA),
    executeAction: createInvoker(IPC_CHANNELS.AUTOMATION_EXECUTE_ACTION),
    getState: createInvoker(IPC_CHANNELS.AUTOMATION_GET_STATE),
    getHistory: createInvoker(IPC_CHANNELS.AUTOMATION_GET_HISTORY),
  },

  // BrowserView
  browserView: {
    load: createInvoker(IPC_CHANNELS.BROWSER_VIEW_LOAD),
    show: createInvoker(IPC_CHANNELS.BROWSER_VIEW_SHOW),
    hide: createInvoker(IPC_CHANNELS.BROWSER_VIEW_HIDE),
    resize: createInvoker(IPC_CHANNELS.BROWSER_VIEW_RESIZE),
    close: createInvoker(IPC_CHANNELS.BROWSER_CLOSE),
  },

  // Event listeners
  events: {
    onStatusUpdate: createListener(IPC_CHANNELS.EVENT_STATUS_UPDATE),
    onFormPreview: createListener(IPC_CHANNELS.EVENT_FORM_PREVIEW),
    onCaptchaDetected: createListener(IPC_CHANNELS.EVENT_CAPTCHA_DETECTED),
    onOtpRequired: createListener(IPC_CHANNELS.EVENT_OTP_REQUIRED),
    onJobCompleted: createListener(IPC_CHANNELS.EVENT_JOB_COMPLETED),
    onPageChanged: createListener(IPC_CHANNELS.EVENT_PAGE_CHANGED),
  },
});

// Types for the exposed API (to be used in renderer)
export type ElectronAPI = typeof import('./preload');

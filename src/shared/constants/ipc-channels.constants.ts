// IPC Channel Names

export const IPC_CHANNELS = {
  // Dashboard
  DASHBOARD_STATS: 'dashboard:stats',
  DASHBOARD_ACTIVITY: 'dashboard:activity',

  // Auth
  AUTH_REGISTER: 'auth:register',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_SESSION: 'auth:get-session',

  // Company
  COMPANY_GET: 'company:get',
  COMPANY_UPDATE: 'company:update',

  // Agent
  AGENT_LIST: 'agent:list',
  AGENT_GET: 'agent:get',
  AGENT_CREATE: 'agent:create',
  AGENT_UPDATE: 'agent:update',
  AGENT_DELETE: 'agent:delete',

  // Client
  CLIENT_LIST: 'client:list',
  CLIENT_GET: 'client:get',
  CLIENT_CREATE: 'client:create',
  CLIENT_UPDATE: 'client:update',
  CLIENT_DELETE: 'client:delete',

  // Document
  DOCUMENT_LIST: 'document:list',
  DOCUMENT_UPLOAD: 'document:upload',
  DOCUMENT_DELETE: 'document:delete',
  DOCUMENT_GET_URL: 'document:get-url',

  // Extraction
  EXTRACTION_LIST: 'extraction:list',
  EXTRACTION_GET: 'extraction:get',
  EXTRACTION_CREATE: 'extraction:create',
  EXTRACTION_UPDATE: 'extraction:update',
  EXTRACTION_APPROVE: 'extraction:approve',
  EXTRACTION_REJECT: 'extraction:reject',
  EXTRACTION_DELETE: 'extraction:delete',

  // Portal
  PORTAL_LIST: 'portal:list',
  PORTAL_GET: 'portal:get',
  PORTAL_CREATE: 'portal:create',
  PORTAL_UPDATE: 'portal:update',
  PORTAL_DELETE: 'portal:delete',

  // Chat
  CHAT_LIST: 'chat:list',
  CHAT_CREATE: 'chat:create',

  AUTOMATION_START: 'automation:start',
  AUTOMATION_STOP: 'automation:stop',
  AUTOMATION_PAUSE: 'automation:pause',
  AUTOMATION_RESUME: 'automation:resume',
  AUTOMATION_APPROVE_MAPPING: 'automation:approve-mapping',
  AUTOMATION_REJECT_MAPPING: 'automation:reject-mapping',
  AUTOMATION_SUBMIT_FORM: 'automation:submit-form',
  AUTOMATION_SUBMIT_OTP: 'automation:submit-otp',
  AUTOMATION_RESUME_AFTER_CAPTCHA: 'automation:resume-after-captcha',
  AUTOMATION_EXECUTE_ACTION: 'automation:execute-action',
  AUTOMATION_GET_STATE: 'automation:get-state',
  AUTOMATION_GET_HISTORY: 'automation:get-history',

  // BrowserView
  BROWSER_VIEW_LOAD: 'browser-view:load',
  BROWSER_VIEW_SHOW: 'browser-view:show',
  BROWSER_VIEW_HIDE: 'browser-view:hide',
  BROWSER_VIEW_RESIZE: 'browser-view:resize',
  BROWSER_CLOSE: 'browser:close',

  // Events (Main -> Renderer)
  EVENT_STATUS_UPDATE: 'event:status-update',
  EVENT_FORM_PREVIEW: 'event:form-preview',
  EVENT_CAPTCHA_DETECTED: 'event:captcha-detected',
  EVENT_OTP_REQUIRED: 'event:otp-required',
  EVENT_JOB_COMPLETED: 'event:job-completed',
  EVENT_PAGE_CHANGED: 'event:page-changed',
  EVENT_MANUAL_INPUT_REQUIRED: 'event:manual-input-required',
  EVENT_ERROR: 'event:error',
} as const;

export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// Job Status Constants

export const JOB_STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type JobStatusType = typeof JOB_STATUS[keyof typeof JOB_STATUS];

export const JOB_STATUS_LABELS: Record<JobStatusType, string> = {
  [JOB_STATUS.QUEUED]: 'Queued',
  [JOB_STATUS.RUNNING]: 'Running',
  [JOB_STATUS.PAUSED]: 'Paused',
  [JOB_STATUS.COMPLETED]: 'Completed',
  [JOB_STATUS.FAILED]: 'Failed',
};

export const PAUSE_REASON = {
  CAPTCHA: 'captcha',
  OTP: 'otp',
  MANUAL_INTERVENTION: 'manual_intervention',
  ERROR: 'error',
  USER_PAUSED: 'user_paused',
} as const;

export type PauseReasonType = typeof PAUSE_REASON[keyof typeof PAUSE_REASON];

export const PAUSE_REASON_LABELS: Record<PauseReasonType, string> = {
  [PAUSE_REASON.CAPTCHA]: 'CAPTCHA Required',
  [PAUSE_REASON.OTP]: 'OTP Required',
  [PAUSE_REASON.MANUAL_INTERVENTION]: 'Manual Intervention',
  [PAUSE_REASON.ERROR]: 'Error Occurred',
  [PAUSE_REASON.USER_PAUSED]: 'User Paused',
};

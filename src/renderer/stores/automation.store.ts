import { create } from 'zustand';
import { api } from '../lib/api';
import type { FormMapping, AutomationJob, CreateJobInput } from '../../shared/types';

interface AutomationStoreState {
  // State
  isRunning: boolean;
  isPaused: boolean;
  currentJob: AutomationJob | null;
  currentMapping: FormMapping | null;
  statusMessage: string;
  progress: number;
  needsApproval: boolean;
  captchaDetected: boolean;
  captchaType: string | null;
  otpDetected: boolean;
  otpFieldSelector: string | null;
  isLoading: boolean;
  error: string | null;
  mode: 'auto' | 'manual';
  
  // Actions
  setMode: (mode: 'auto' | 'manual') => Promise<void>;
  startAutomation: (data: CreateJobInput) => Promise<boolean>;
  stopAutomation: () => Promise<void>;
  pauseAutomation: () => Promise<void>;
  resumeAutomation: () => Promise<void>;
  approveMapping: (mapping: FormMapping) => Promise<boolean>;
  rejectMapping: (reason: string) => Promise<boolean>;
  submitForm: () => Promise<boolean>;
  submitOtp: (otp: string) => Promise<boolean>;
  resumeAfterCaptcha: () => Promise<boolean>;
  loadUrl: (url: string) => Promise<void>;
  hidePreview: () => Promise<void>;
  closeBrowser: () => Promise<void>;
  
  // Internal
  setStatus: (message: string, progress: number) => void;
  setMapping: (mapping: FormMapping) => void;
  setCaptcha: (type: string) => void;
  setOtp: (selector: string) => void;
  setJobCompleted: (success: boolean) => void;
  setPage: (page: number, total: number) => void;
  reset: () => void;
  clearError: () => void;
}

const initialState = {
  isRunning: false,
  isPaused: false,
  currentJob: null,
  currentMapping: null,
  statusMessage: 'Ready',
  progress: 0,
  needsApproval: false,
  captchaDetected: false,
  captchaType: null,
  otpDetected: false,
  otpFieldSelector: null,
  isLoading: false,
  error: null,
  mode: 'manual' as 'auto' | 'manual',
};

export const useAutomationStore = create<AutomationStoreState>((set, get) => ({
  ...initialState,

  setMode: async (mode) => {
    try {
      await api.automation.setMode({ mode });
      set({ mode });
    } catch {
      set({ error: 'Failed to set mode' });
    }
  },

  startAutomation: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.automation.start(data);
      if (result.success && result.data) {
        set({
          isRunning: true,
          currentJob: result.data,
          statusMessage: 'Starting automation...',
          progress: 0,
          isLoading: false,
        });
        return true;
      } else {
        set({ error: result.error || 'Failed to start automation', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  stopAutomation: async () => {
    try {
      await api.automation.stop();
      // NOTE: Don't hide browser view on stop - keep it open for manual use
      set({ isRunning: false, isPaused: false, currentJob: null, statusMessage: 'Automation stopped' });
    } catch {
      set({ error: 'Failed to stop automation' });
    }
  },

  pauseAutomation: async () => {
    try {
      await api.automation.pause();
      set({ isPaused: true, statusMessage: 'Paused' });
    } catch {
      set({ error: 'Failed to pause automation' });
    }
  },

  resumeAutomation: async () => {
    try {
      await api.automation.resume();
      set({ isPaused: false, statusMessage: 'Resuming...' });
    } catch {
      set({ error: 'Failed to resume automation' });
    }
  },

  approveMapping: async (mapping) => {
    set({ isLoading: true });
    try {
      const result = await api.automation.approveMapping({ mapping });
      if (result.success) {
        set({ needsApproval: false, statusMessage: 'Filling form...', isLoading: false });
        return true;
      } else {
        set({ error: result.error || 'Failed to approve', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  rejectMapping: async (reason) => {
    set({ isLoading: true });
    try {
      const result = await api.automation.rejectMapping({ reason });
      if (result.success) {
        set({ needsApproval: false, currentMapping: null, isLoading: false });
        return true;
      } else {
        set({ error: result.error || 'Failed to reject', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  submitForm: async () => {
    set({ isLoading: true });
    try {
      const result = await api.automation.submitForm();
      if (result.success) {
        set({ statusMessage: 'Form submitted, checking for next page...', isLoading: false });
        return true;
      } else {
        set({ error: result.error || 'Failed to submit form', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  submitOtp: async (otp) => {
    set({ isLoading: true });
    try {
      const result = await api.automation.submitOtp({ otp });
      if (result.success) {
        set({ otpDetected: false, otpFieldSelector: null, statusMessage: 'OTP submitted', isLoading: false });
        return true;
      } else {
        set({ error: result.error || 'Failed to submit OTP', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  resumeAfterCaptcha: async () => {
    set({ isLoading: true });
    try {
      const result = await api.automation.resumeAfterCaptcha();
      if (result.success) {
        set({ captchaDetected: false, captchaType: null, statusMessage: 'Resuming after CAPTCHA...', isLoading: false });
        return true;
      } else {
        set({ error: result.error || 'Failed to resume', isLoading: false });
        return false;
      }
    } catch {
      set({ error: 'An unexpected error occurred', isLoading: false });
      return false;
    }
  },

  loadUrl: async (url) => {
    try {
      await api.browserView.load({ url });
    } catch {
      set({ error: 'Failed to load URL' });
    }
  },

  hidePreview: async () => {
    try {
      await api.browserView.hide();
    } catch {
      // Ignore
    }
  },

  closeBrowser: async () => {
    try {
      await api.browserView.close();
    } catch {
      // Ignore
    }
  },

  // Internal setters
  setStatus: (message, progress) => set({ statusMessage: message, progress }),
  setMapping: (mapping) => set({ currentMapping: mapping, needsApproval: true }),
  setCaptcha: (type) => set({ captchaDetected: true, captchaType: type, isPaused: true }),
  setOtp: (selector) => set({ otpDetected: true, otpFieldSelector: selector, isPaused: true }),
  setJobCompleted: (success) => set({ 
    isRunning: false, 
    isPaused: false,
    statusMessage: success ? 'Automation completed successfully' : 'Automation failed',
    progress: success ? 100 : get().progress,
  }),
  setPage: (page, total) => set({ 
    statusMessage: `Processing page ${page} of ${total}`,
    progress: Math.round((page / total) * 100),
  }),
  reset: () => set(initialState),
  clearError: () => set({ error: null }),
}));

// Subscribe to events from main process
if (typeof window !== 'undefined' && window.electronAPI) {
  api.events.onStatusUpdate((data) => {
    useAutomationStore.getState().setStatus(data.message, data.progress);
  });

  api.events.onFormPreview((data) => {
    useAutomationStore.getState().setMapping(data);
  });

  api.events.onCaptchaDetected((data) => {
    useAutomationStore.getState().setCaptcha(data.type);
  });

  api.events.onOtpRequired((data) => {
    useAutomationStore.getState().setOtp(data.fieldSelector);
  });

  api.events.onJobCompleted((data) => {
    useAutomationStore.getState().setJobCompleted(data.success);
  });

  api.events.onPageChanged((data) => {
    useAutomationStore.getState().setPage(data.page, data.total);
  });
}

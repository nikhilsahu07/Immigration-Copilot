const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startAutomation: ({ url, prompt }) =>
    ipcRenderer.invoke('start-automation', { url, prompt }),
  stopAutomation: () => ipcRenderer.invoke('stop-automation'),
  approveAndSubmit: () => ipcRenderer.invoke('approve-and-submit'),
  finalSubmit: () => ipcRenderer.invoke('final-submit'),

  // NEW: Resume after CAPTCHA
  resumeAfterCaptcha: () => ipcRenderer.invoke('resume-after-captcha'),

  // NEW: Submit OTP
  submitOtp: (otpCode) => ipcRenderer.invoke('submit-otp', otpCode),

  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (event, data) => callback(data));
  },

  onFormPreview: (callback) => {
    ipcRenderer.on('form-preview', (event, data) => callback(data));
  },

  onCaptchaDetected: (callback) => {
    ipcRenderer.on('captcha-detected', (event, data) => callback(data));
  },

  onOtpRequired: (callback) => {
    ipcRenderer.on('otp-required', (event, data) => callback(data));
  },
});

// Onboarding preload script for secure IPC communication

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Send action to main process
  sendAction: (action) => {
    ipcRenderer.emit('onboarding-action', action);
  },

  // Accept privacy terms
  acceptPrivacy: () => {
    ipcRenderer.emit('privacy-accepted');
  },

  // Listen for step updates
  onStepUpdate: (callback) => {
    ipcRenderer.on('step-update', callback);
  },

  // Listen for validation results
  onValidationResult: (callback) => {
    ipcRenderer.on('validation-result', callback);
  },

  // Get platform information
  getPlatform: () => {
    return process.platform;
  },

  // Check permission status
  checkPermissions: () => {
    return ipcRenderer.invoke('check-permissions');
  }
});
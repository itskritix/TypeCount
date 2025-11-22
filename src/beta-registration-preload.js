// Beta registration preload script for secure IPC communication

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process for beta registration
contextBridge.exposeInMainWorld('electronAPI', {
  // Register as beta tester
  registerBetaTester: (registrationData) => {
    ipcRenderer.send('register-beta-tester', registrationData);
  },

  // Listen for registration result
  onRegistrationResult: (callback) => {
    ipcRenderer.on('registration-result', callback);
  },

  // Get platform information
  getPlatform: () => {
    return process.platform;
  },

  // Close window
  closeWindow: () => {
    window.close();
  }
});
// Beta feedback preload script for secure IPC communication

const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process for beta feedback
contextBridge.exposeInMainWorld('electronAPI', {
  // Submit feedback to main process
  submitFeedback: (feedbackData) => {
    ipcRenderer.send('submit-feedback', feedbackData);
  },

  // Listen for feedback submission result
  onFeedbackResult: (callback) => {
    ipcRenderer.on('feedback-result', callback);
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
// Preload script for onboarding window
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  sendAction: (action: string) => {
    ipcRenderer.send('onboarding-action', action);
  },
  acceptPrivacy: () => {
    ipcRenderer.send('onboarding-accept-privacy');
  },
  onStepUpdate: (callback: (step: unknown, currentIndex: number, totalSteps: number) => void) => {
    ipcRenderer.on('onboarding-step-update', (_event, step, currentIndex, totalSteps) => {
      callback(step, currentIndex, totalSteps);
    });
  }
});

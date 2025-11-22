// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  onKeystrokeUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('keystroke-update', (_event, data) => callback(data));
  },
  onInitialData: (callback: (data: any) => void) => {
    ipcRenderer.on('initial-data', (_event, data) => callback(data));
  },
  onAchievementUnlocked: (callback: (achievement: string) => void) => {
    ipcRenderer.on('achievement-unlocked', (_event, achievement) => callback(achievement));
  },
  requestData: () => {
    ipcRenderer.send('request-data');
  }
});

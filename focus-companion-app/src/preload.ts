import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('focusCompanion', {
  platform: process.platform,
  getTimerState: () => ipcRenderer.invoke('timer:get-state'),
  startTimer: () => ipcRenderer.invoke('timer:start'),
  startFocusTimer: (minutes: number) => ipcRenderer.invoke('timer:start-focus', minutes),
  startBreakTimer: () => ipcRenderer.invoke('timer:start-break'),
  pauseTimer: () => ipcRenderer.invoke('timer:pause'),
  setTimerDuration: (minutes: number) => ipcRenderer.invoke('timer:set-duration', minutes),
  resetTimer: () => ipcRenderer.invoke('timer:reset'),
  onTimerUpdate: (callback: (snapshot: TimerSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: TimerSnapshot) => callback(snapshot);
    ipcRenderer.on('timer:updated', listener);
    return () => ipcRenderer.removeListener('timer:updated', listener);
  },
});

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('focusCompanion', {
  platform: process.platform,
  getTimerState: () => ipcRenderer.invoke('timer:get-state'),
  setMaxFocusEnabled: (enabled: boolean) => ipcRenderer.invoke('max-focus:set-enabled', enabled),
  setMaxFocusThreshold: (seconds: number) => ipcRenderer.invoke('max-focus:set-threshold', seconds),
  getPendingMaxFocusNudge: () => ipcRenderer.invoke('max-focus:get-pending-nudge'),
  dismissMaxFocusNudge: () => ipcRenderer.invoke('max-focus:dismiss-nudge'),
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
  onMaxFocusNudge: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('max-focus:idle-nudge', listener);
    return () => ipcRenderer.removeListener('max-focus:idle-nudge', listener);
  },
  onMaxFocusActivity: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('max-focus:activity-resumed', listener);
    return () => ipcRenderer.removeListener('max-focus:activity-resumed', listener);
  },
  quitApp: () => ipcRenderer.invoke('app:quit'),
  hidePopup: () => ipcRenderer.invoke('popup:hide'),
  showMainWindow: () => ipcRenderer.invoke('app:show-main'),
  onCelebration: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('celebration:start', listener);
    return () => ipcRenderer.removeListener('celebration:start', listener);
  },
  setDesktopPetVisible: (visible: boolean) => ipcRenderer.invoke('pet:set-visible', visible),
  closeDesktopPet: () => ipcRenderer.invoke('pet:close'),
  setDesktopPetAppearance: (appearance: DesktopPetAppearance) => ipcRenderer.invoke('pet:set-appearance', appearance),
  getDesktopPetAppearance: () => ipcRenderer.invoke('pet:get-appearance'),
  onDesktopPetAppearance: (callback: (appearance: DesktopPetAppearance) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, appearance: DesktopPetAppearance) => callback(appearance);
    ipcRenderer.on('pet:appearance-updated', listener);
    return () => ipcRenderer.removeListener('pet:appearance-updated', listener);
  },
});

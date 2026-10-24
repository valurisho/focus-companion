import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('focusCompanion', {
  platform: process.platform,
});

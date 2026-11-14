import {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  powerMonitor,
  screen,
  Tray,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

if (started) {
  app.quit();
}

const initialDurationMinutes = 20;
let maxFocusIdleThresholdSeconds = 3 * 60;
let focusDurationMinutes = initialDurationMinutes;
const timerPopupSize = { width: 220, height: 140 };
const trayDiagnosticMode = false;

let mainWindow: BrowserWindow | null = null;
let timerPopup: BrowserWindow | null = null;
let desktopPetWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let timerPopupReady = false;
let timerPopupWantedVisible = false;
let showPopupInactive = false;
let pendingCelebration = false;
let timerEndsAt: number | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let maxFocusEnabled = false;
let maxFocusNudgeSent = false;
let maxFocusNudgePending = false;
let timerState: TimerSnapshot = {
  status: 'ready',
  mode: 'focus',
  durationMinutes: initialDurationMinutes,
  remainingSeconds: initialDurationMinutes * 60,
};
let desktopPetAppearance: DesktopPetAppearance = {
  buddyName: 'Tomo',
  look: 'blob',
  accessory: null,
};

function formatTime(seconds: number, durationMinutes = 0, includeSeconds = true) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!includeSeconds) {
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  if (durationMinutes >= 60) {
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function getTimerSnapshot(): TimerSnapshot {
  if (timerEndsAt !== null) {
    const remainingSeconds = Math.max(0, Math.ceil((timerEndsAt - Date.now()) / 1000));
    timerState = {
      ...timerState,
      remainingSeconds,
      status: remainingSeconds === 0 ? 'complete' : 'running',
    };

    if (remainingSeconds === 0) {
      timerEndsAt = null;
    }
  }

  return { ...timerState };
}

function checkMaxFocusActivity(snapshot: TimerSnapshot) {
  if (!maxFocusEnabled || snapshot.status !== 'running' || snapshot.mode !== 'focus') {
    maxFocusNudgeSent = false;
    maxFocusNudgePending = false;
    return;
  }

  const idleSeconds = powerMonitor.getSystemIdleTime();
  if (idleSeconds < maxFocusIdleThresholdSeconds) {
    // Activity resumed — allow a future nudge to fire once idle again,
    // but do NOT clear maxFocusNudgePending: the nudge UI may still be
    // visible and the user must dismiss it explicitly.
    maxFocusNudgeSent = false;
    return;
  }

  // Don't re-fire while a nudge is already showing or pending user dismissal.
  if (maxFocusNudgeSent || maxFocusNudgePending) return;

  maxFocusNudgeSent = true;
  maxFocusNudgePending = true;
  showMaxFocusNudge();
}

function showMaxFocusNudge() {
  const window = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createMainWindow();
  if (window.isMinimized()) window.restore();
  // Show without stealing keyboard focus — dock bounce + chime gets attention gently
  window.showInactive();
  window.webContents.send('max-focus:idle-nudge');
  if (process.platform === 'darwin' && app.dock) {
    app.dock.bounce('informational');
  }
}

function publishTimerState(): TimerSnapshot {
  const previousStatus = timerState.status;
  const snapshot = getTimerSnapshot();
  tray?.setTitle(
    trayDiagnosticMode ? '' : formatTime(snapshot.remainingSeconds, snapshot.durationMinutes, snapshot.status !== 'ready'),
    { fontType: 'monospacedDigit' },
  );

  for (const window of [mainWindow, timerPopup]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('timer:updated', snapshot);
    }
  }

  checkMaxFocusActivity(snapshot);

  if (snapshot.status !== 'running' && timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (snapshot.mode === 'focus' && snapshot.status === 'complete' && previousStatus === 'running') {
    autoshowCelebration();
  }

  return snapshot;
}

function ensureTimerInterval() {
  if (timerInterval !== null) return;
  timerInterval = setInterval(() => publishTimerState(), 1000);
}

function startTimer(): TimerSnapshot {
  const current = getTimerSnapshot();
  if (current.status === 'running') return publishTimerState();

  const remainingSeconds = current.status === 'complete'
    ? current.durationMinutes * 60
    : current.remainingSeconds;

  timerState = { ...current, status: 'running', remainingSeconds };
  timerEndsAt = Date.now() + remainingSeconds * 1000;
  ensureTimerInterval();
  return publishTimerState();
}

function pauseTimer(): TimerSnapshot {
  const current = getTimerSnapshot();
  if (current.status !== 'running') return current;

  timerEndsAt = null;
  timerState = { ...current, status: 'paused' };
  return publishTimerState();
}

function setTimerDuration(minutes: number): TimerSnapshot {
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 295) {
    throw new Error('Timer duration must be between 5 and 295 whole minutes.');
  }

  focusDurationMinutes = minutes;
  timerEndsAt = null;
  timerState = {
    status: 'ready',
    mode: 'focus',
    durationMinutes: minutes,
    remainingSeconds: minutes * 60,
  };
  return publishTimerState();
}

function startFocusTimer(minutes: number): TimerSnapshot {
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 295) {
    throw new Error('Timer duration must be between 5 and 295 whole minutes.');
  }

  focusDurationMinutes = minutes;
  timerState = {
    status: 'running',
    mode: 'focus',
    durationMinutes: minutes,
    remainingSeconds: minutes * 60,
  };
  timerEndsAt = Date.now() + minutes * 60 * 1000;
  ensureTimerInterval();
  return publishTimerState();
}

function startBreakTimer(): TimerSnapshot {
  const minutes = 5;
  timerState = {
    status: 'running',
    mode: 'break',
    durationMinutes: minutes,
    remainingSeconds: minutes * 60,
  };
  timerEndsAt = Date.now() + minutes * 60 * 1000;
  ensureTimerInterval();
  return publishTimerState();
}

function resetTimer(): TimerSnapshot {
  timerEndsAt = null;
  timerState = {
    status: 'ready',
    mode: 'focus',
    durationMinutes: focusDurationMinutes,
    remainingSeconds: focusDurationMinutes * 60,
  };
  return publishTimerState();
}

function isTrustedRenderer(event: IpcMainInvokeEvent) {
  return [mainWindow, timerPopup, desktopPetWindow].some((window) => window && !window.isDestroyed() && window.webContents === event.sender);
}

function createDesktopPetWindow() {
  if (desktopPetWindow && !desktopPetWindow.isDestroyed()) return desktopPetWindow;

  const { workArea } = screen.getPrimaryDisplay();
  const width = 132;
  const height = 132;
  const window = new BrowserWindow({
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 32,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  desktopPetWindow = window;
  if (process.platform === 'darwin') {
    window.setAlwaysOnTop(true, 'floating');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  }
  window.on('closed', () => {
    if (desktopPetWindow === window) desktopPetWindow = null;
  });
  window.webContents.on('did-finish-load', () => {
    window.webContents.send('pet:appearance-updated', desktopPetAppearance);
  });
  loadRenderer(window, 'pet');
  return window;
}

function setDesktopPetVisible(visible: boolean) {
  if (visible) {
    const window = createDesktopPetWindow();
    window.showInactive();
  } else {
    desktopPetWindow?.hide();
  }
}

function registerTimerIpc() {
  ipcMain.handle('timer:get-state', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested timer state.');
    return getTimerSnapshot();
  });

  ipcMain.handle('max-focus:set-enabled', (event, enabled: unknown) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer changed Max Focus settings.');
    if (typeof enabled !== 'boolean') throw new Error('Max Focus setting must be true or false.');
    maxFocusEnabled = enabled;
    maxFocusNudgeSent = false;
    maxFocusNudgePending = false;
    if (enabled) checkMaxFocusActivity(getTimerSnapshot());
    return undefined;
  });

  ipcMain.handle('max-focus:get-pending-nudge', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested Max Focus state.');
    const pending = maxFocusNudgePending;
    maxFocusNudgePending = false;
    return pending;
  });

  ipcMain.handle('max-focus:dismiss-nudge', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer dismissed a Max Focus nudge.');
    maxFocusNudgePending = false;
  });

  ipcMain.handle('max-focus:set-threshold', (event, seconds: unknown) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer changed Max Focus threshold.');
    if (seconds !== 180 && seconds !== 300 && seconds !== 600) {
      throw new Error('Max Focus threshold must be 180, 300, or 600 seconds.');
    }
    maxFocusIdleThresholdSeconds = seconds;
    return undefined;
  });

  ipcMain.handle('timer:start', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested timer start.');
    return startTimer();
  });

  ipcMain.handle('timer:start-focus', (event, minutes: number) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested a focus timer.');
    return startFocusTimer(minutes);
  });

  ipcMain.handle('timer:start-break', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested a break timer.');
    return startBreakTimer();
  });

  ipcMain.handle('timer:pause', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested timer pause.');
    return pauseTimer();
  });

  ipcMain.handle('timer:set-duration', (event, minutes: number) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested timer update.');
    return setTimerDuration(minutes);
  });

  ipcMain.handle('timer:reset', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested timer reset.');
    return resetTimer();
  });

  ipcMain.handle('app:quit', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested app quit.');
    app.quit();
  });

  ipcMain.handle('popup:hide', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested popup hide.');
    timerPopupWantedVisible = false;
    timerPopup?.hide();
  });

  ipcMain.handle('app:show-main', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested main window.');
    timerPopupWantedVisible = false;
    timerPopup?.hide();
    createMainWindow();
  });

  ipcMain.handle('pet:set-visible', (event, visible: unknown) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer changed desktop pet visibility.');
    if (typeof visible !== 'boolean') throw new Error('Desktop pet visibility must be true or false.');
    setDesktopPetVisible(visible);
  });

  ipcMain.handle('pet:close', (event) => {
    if (!desktopPetWindow || desktopPetWindow.isDestroyed() || desktopPetWindow.webContents !== event.sender) {
      throw new Error('Only the desktop pet can close its own window.');
    }
    desktopPetWindow.close();
  });

  ipcMain.handle('pet:set-appearance', (event, value: unknown) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer changed desktop pet appearance.');
    if (typeof value !== 'object' || value === null) throw new Error('Desktop pet appearance must be an object.');
    const appearance = value as Partial<DesktopPetAppearance>;
    const look = ['blob', 'cat', 'owl'].includes(String(appearance.look)) ? appearance.look as DesktopPetAppearance['look'] : 'blob';
    const accessory = appearance.accessory && typeof appearance.accessory === 'object'
      ? {
          name: String(appearance.accessory.name ?? '').slice(0, 60),
          icon: String(appearance.accessory.icon ?? '✦').slice(0, 8),
          slot: String(appearance.accessory.slot ?? 'other').slice(0, 24),
        }
      : null;
    desktopPetAppearance = {
      buddyName: String(appearance.buddyName ?? 'Tomo').trim().slice(0, 20) || 'Tomo',
      look,
      accessory,
    };
    desktopPetWindow?.webContents.send('pet:appearance-updated', desktopPetAppearance);
  });

  ipcMain.handle('pet:get-appearance', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested desktop pet appearance.');
    return desktopPetAppearance;
  });
}

function loadRenderer(window: BrowserWindow, view?: string) {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = view
      ? `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=${encodeURIComponent(view)}`
      : MAIN_WINDOW_VITE_DEV_SERVER_URL;
    void window.loadURL(url);
    return;
  }

  const htmlPath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  void window.loadFile(htmlPath, view ? { query: { view } } : undefined);
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const windowWidth = Math.min(500, workArea.width);
  const windowHeight = Math.min(600, workArea.height);

  const window = new BrowserWindow({
    x: workArea.x + Math.round((workArea.width - windowWidth) / 2),
    y: workArea.y + Math.round((workArea.height - windowHeight) / 2),
    width: windowWidth,
    height: windowHeight,
    minWidth: windowWidth,
    maxWidth: windowWidth,
    minHeight: windowHeight,
    maxHeight: windowHeight,
    resizable: false,
    icon: path.join(app.getAppPath(), 'assets', 'app-icon.png'),
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.on('did-finish-load', () => publishTimerState());
  loadRenderer(window);
  return window;
}

function positionTimerPopup() {
  if (!tray || !timerPopup || timerPopup.isDestroyed()) return;

  const trayBounds = tray.getBounds();
  const { workArea } = screen.getDisplayMatching(trayBounds);
  const x = Math.max(
    workArea.x,
    Math.min(
      Math.round(trayBounds.x + trayBounds.width / 2 - timerPopupSize.width / 2),
      workArea.x + workArea.width - timerPopupSize.width,
    ),
  );
  const y = Math.max(
    workArea.y,
    Math.min(trayBounds.y + trayBounds.height, workArea.y + workArea.height - timerPopupSize.height),
  );

  timerPopup.setPosition(x, y, false);
}

function autoshowCelebration() {
  timerPopupWantedVisible = true;
  showPopupInactive = true;
  pendingCelebration = true;
  const popup = timerPopup && !timerPopup.isDestroyed() ? timerPopup : createTimerPopup();
  positionTimerPopup();
  if (timerPopupReady) {
    popup.showInactive();
    popup.webContents.send('celebration:start');
    showPopupInactive = false;
    pendingCelebration = false;
  }
  if (process.platform === 'darwin' && app.dock) {
    app.dock.bounce('informational');
  }
}

function createTimerPopup() {
  const popup = new BrowserWindow({
    width: timerPopupSize.width,
    height: timerPopupSize.height,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#f7f6f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  timerPopup = popup;
  timerPopupReady = false;
  popup.once('ready-to-show', () => {
    if (timerPopup !== popup) return;
    timerPopupReady = true;
    if (timerPopupWantedVisible) {
      positionTimerPopup();
      if (showPopupInactive) {
        popup.showInactive();
        showPopupInactive = false;
      } else {
        popup.show();
      }
      publishTimerState();
      if (pendingCelebration) {
        const popupRef = popup;
        setTimeout(() => {
          if (!popupRef.isDestroyed()) {
            popupRef.webContents.send('celebration:start');
          }
          pendingCelebration = false;
        }, 200);
      }
    }
  });
  popup.on('blur', () => {
    timerPopupWantedVisible = false;
    popup.hide();
  });
  popup.on('closed', () => {
    if (timerPopup === popup) timerPopup = null;
  });
  popup.webContents.on('did-finish-load', () => publishTimerState());
  loadRenderer(popup, 'timer');
  return popup;
}

function toggleTimerPopup() {
  if (!tray) return;
  if (timerPopupWantedVisible) {
    timerPopupWantedVisible = false;
    timerPopup?.hide();
    return;
  }

  timerPopupWantedVisible = true;
  const popup = timerPopup && !timerPopup.isDestroyed() ? timerPopup : createTimerPopup();
  positionTimerPopup();
  if (timerPopupReady) {
    popup.show();
    publishTimerState();
  }
}

function createTray() {
  if (tray && !tray.isDestroyed()) return;
  const iconPath = path.join(app.getAppPath(), 'assets', 'focusCompanionTemplate.png');
  const diagnosticMode = trayDiagnosticMode;
  const sourceIcon = diagnosticMode
    ? nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'focusCompanionTemplate.png'))
    : nativeImage.createFromPath(iconPath);
  const icon = diagnosticMode ? sourceIcon : sourceIcon.resize({ width: 16 });
  if (!diagnosticMode) icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip("Tomo's Nook timer");
  tray.setTitle(
    diagnosticMode ? '' : formatTime(timerState.remainingSeconds, timerState.durationMinutes, timerState.status !== 'ready'),
    { fontType: 'monospacedDigit' },
  );
  tray.setIgnoreDoubleClickEvents(true);
  tray.on('click', toggleTimerPopup);
  tray.on('right-click', toggleTimerPopup);
}

registerTimerIpc();

// Enforce a single running instance. If a second launch is attempted,
// quit it immediately and show/focus the existing window instead.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // A second launch was attempted — bring the existing window forward.
    createMainWindow();
  });

  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      if (app.dock) {
        app.dock.setIcon(nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'app-icon.png')));
      }
      createTray();
    }
    createMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
    }
  });
}

import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
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
const timerPopupSize = { width: 220, height: 104 };
const trayDiagnosticMode = true;

let mainWindow: BrowserWindow | null = null;
let timerPopup: BrowserWindow | null = null;
let tray: Tray | null = null;
let timerPopupReady = false;
let timerPopupWantedVisible = false;
let timerEndsAt: number | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerState: TimerSnapshot = {
  status: 'ready',
  durationMinutes: initialDurationMinutes,
  remainingSeconds: initialDurationMinutes * 60,
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
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

function publishTimerState(): TimerSnapshot {
  const snapshot = getTimerSnapshot();
  tray?.setTitle(
    trayDiagnosticMode ? '' : formatTime(snapshot.remainingSeconds),
    { fontType: 'monospacedDigit' },
  );

  for (const window of [mainWindow, timerPopup]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('timer:updated', snapshot);
    }
  }

  if (snapshot.status !== 'running' && timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
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

  timerEndsAt = null;
  timerState = {
    status: 'ready',
    durationMinutes: minutes,
    remainingSeconds: minutes * 60,
  };
  return publishTimerState();
}

function resetTimer(): TimerSnapshot {
  timerEndsAt = null;
  timerState = {
    status: 'ready',
    durationMinutes: timerState.durationMinutes,
    remainingSeconds: timerState.durationMinutes * 60,
  };
  return publishTimerState();
}

function isTrustedRenderer(event: IpcMainInvokeEvent) {
  return [mainWindow, timerPopup].some((window) => window && !window.isDestroyed() && window.webContents === event.sender);
}

function registerTimerIpc() {
  ipcMain.handle('timer:get-state', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested timer state.');
    return getTimerSnapshot();
  });

  ipcMain.handle('timer:start', (event) => {
    if (!isTrustedRenderer(event)) throw new Error('Untrusted renderer requested timer start.');
    return startTimer();
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
      popup.show();
      publishTimerState();
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
  const iconPath = path.join(app.getAppPath(), 'assets', 'focusCompanionTemplate.png');
  const diagnosticMode = trayDiagnosticMode;
  const sourceIcon = diagnosticMode
    ? nativeImage.createFromPath(path.join(app.getAppPath(), 'assets', 'focusCompanionTemplate.png'))
    : nativeImage.createFromPath(iconPath);
  const icon = diagnosticMode ? sourceIcon : sourceIcon.resize({ width: 16 });
  if (!diagnosticMode) icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('Focus Companion timer');
  tray.setTitle(
    diagnosticMode ? '' : formatTime(timerState.remainingSeconds),
    { fontType: 'monospacedDigit' },
  );
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Quit Focus Companion', role: 'quit' },
  ]));
  tray.setIgnoreDoubleClickEvents(true);
  tray.on('click', toggleTimerPopup);
}

registerTimerIpc();

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
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

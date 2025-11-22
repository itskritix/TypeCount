import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, systemPreferences, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import AutoLaunch from 'auto-launch';
import { autoUpdater } from 'electron-updater';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Configure auto-launch
const autoLauncher = new AutoLaunch({
  name: 'TypeCount',
  path: app.getPath('exe'),
});

// Initialize electron-store for data persistence
interface StoreSchema {
  totalKeystrokes: number;
  dailyKeystrokes: Record<string, number>;
  hourlyKeystrokes: Record<string, number[]>;
  currentSessionKeystrokes: number;
  firstUsedDate: string;
  lastResetDate: string;
  achievements: string[];
  streakDays: number;
  lastActiveDate: string;
  autoLaunchEnabled: boolean;
}

const store = new Store<StoreSchema>({
  defaults: {
    totalKeystrokes: 0,
    dailyKeystrokes: {},
    hourlyKeystrokes: {},
    currentSessionKeystrokes: 0,
    firstUsedDate: new Date().toISOString(),
    lastResetDate: new Date().toISOString(),
    achievements: [],
    streakDays: 0,
    lastActiveDate: new Date().toISOString(),
    autoLaunchEnabled: true
  }
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let keystrokeCount = 0;
let sessionStartTime = Date.now();

// Track keystrokes without storing actual keys (privacy-first)
const startKeystrokeTracking = () => {
  try {
    uIOhook.on('keydown', (e) => {
      // Count keystroke without logging the actual key
      keystrokeCount++;
      updateKeystrokeData();

      // Send update to renderer if window is open
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('keystroke-update', {
          total: store.get('totalKeystrokes'),
          session: store.get('currentSessionKeystrokes'),
          today: getTodayKeystrokes()
        });
      }
    });

    uIOhook.start();
    console.log('Keystroke tracking started');
  } catch (error) {
    console.error('Failed to start keystroke tracking:', error);
    // On macOS, likely needs accessibility permissions
    if (process.platform === 'darwin') {
      requestAccessibilityPermissions();
    }
  }
};

const stopKeystrokeTracking = () => {
  try {
    uIOhook.stop();
    console.log('Keystroke tracking stopped');
  } catch (error) {
    console.error('Failed to stop keystroke tracking:', error);
  }
};

const updateKeystrokeData = () => {
  // Update total count
  store.set('totalKeystrokes', store.get('totalKeystrokes') + 1);

  // Update session count
  store.set('currentSessionKeystrokes', store.get('currentSessionKeystrokes') + 1);

  // Update daily count
  const today = new Date().toISOString().split('T')[0];
  const dailyKeystrokes = store.get('dailyKeystrokes');
  dailyKeystrokes[today] = (dailyKeystrokes[today] || 0) + 1;
  store.set('dailyKeystrokes', dailyKeystrokes);

  // Update hourly count
  const hour = new Date().getHours();
  const hourlyKey = `${today}-${hour}`;
  const hourlyKeystrokes = store.get('hourlyKeystrokes');
  if (!hourlyKeystrokes[today]) {
    hourlyKeystrokes[today] = new Array(24).fill(0);
  }
  hourlyKeystrokes[today][hour]++;
  store.set('hourlyKeystrokes', hourlyKeystrokes);

  // Update streak
  updateStreak();

  // Check for achievements
  checkAchievements();
};

const getTodayKeystrokes = () => {
  const today = new Date().toISOString().split('T')[0];
  return store.get('dailyKeystrokes')[today] || 0;
};

const updateStreak = () => {
  const today = new Date().toISOString().split('T')[0];
  const lastActive = store.get('lastActiveDate');

  if (lastActive !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastActive === yesterdayStr) {
      store.set('streakDays', store.get('streakDays') + 1);
    } else {
      store.set('streakDays', 1);
    }
    store.set('lastActiveDate', today);
  }
};

const checkAchievements = () => {
  const total = store.get('totalKeystrokes');
  const achievements = store.get('achievements');

  const milestones = [
    { count: 1000, name: '1K_keystrokes' },
    { count: 10000, name: '10K_keystrokes' },
    { count: 100000, name: '100K_keystrokes' },
    { count: 1000000, name: '1M_keystrokes' }
  ];

  for (const milestone of milestones) {
    if (total >= milestone.count && !achievements.includes(milestone.name)) {
      achievements.push(milestone.name);
      store.set('achievements', achievements);

      // Show notification for achievement
      if (mainWindow) {
        mainWindow.webContents.send('achievement-unlocked', milestone.name);
      }
    }
  }
};

const requestAccessibilityPermissions = async () => {
  if (process.platform === 'darwin') {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    if (!trusted) {
      const result = await dialog.showMessageBox({
        type: 'info',
        title: 'Accessibility Permission Required',
        message: 'TypeCount needs accessibility permissions to track your typing activity.',
        detail: 'Please grant permission in System Preferences > Security & Privacy > Privacy > Accessibility',
        buttons: ['OK', 'Quit']
      });

      if (result.response === 1) {
        app.quit();
      }
    }
  }
};

// Configure auto-updater
const setupAutoUpdater = () => {
  // Configure update server
  // For GitHub releases (default)
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'itskritix', // Replace with your GitHub username
    repo: 'TypeCount'
  });

  // Check for updates every hour
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 60 * 60 * 1000);

  // Check for updates on startup
  autoUpdater.checkForUpdatesAndNotify();

  // Auto-updater events
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);

    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) of TypeCount is available!`,
      detail: 'It will be downloaded in the background and installed when you quit the app.',
      buttons: ['OK']
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available');
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`;
    console.log(logMessage);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);

    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded.',
      detail: 'The application will update when you quit. Would you like to restart now?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
};

const createTray = () => {
  // Create tray icon
  const iconPath = path.join(__dirname, '../renderer/assets/icon.png');
  let trayIcon = nativeImage.createFromPath(iconPath);

  // Fallback to a simple icon if the file doesn't exist
  if (trayIcon.isEmpty()) {
    // Create a simple 16x16 icon programmatically
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Total: ${store.get('totalKeystrokes').toLocaleString()} keystrokes`,
      enabled: false
    },
    {
      label: `Today: ${getTodayKeystrokes().toLocaleString()} keystrokes`,
      enabled: false
    },
    {
      label: `Streak: ${store.get('streakDays')} days`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          createWindow();
        } else {
          mainWindow.show();
        }
      }
    },
    {
      label: 'Start at login',
      type: 'checkbox',
      checked: store.get('autoLaunchEnabled'),
      click: async (menuItem) => {
        const enabled = menuItem.checked;
        store.set('autoLaunchEnabled', enabled);

        try {
          if (enabled) {
            await autoLauncher.enable();
          } else {
            await autoLauncher.disable();
          }
        } catch (error) {
          console.error('Failed to update auto-launch:', error);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('TypeCount - Keystroke Tracker');
  tray.setContextMenu(contextMenu);

  // Update tray menu periodically
  setInterval(() => {
    const updatedMenu = Menu.buildFromTemplate([
      {
        label: `Total: ${store.get('totalKeystrokes').toLocaleString()} keystrokes`,
        enabled: false
      },
      {
        label: `Today: ${getTodayKeystrokes().toLocaleString()} keystrokes`,
        enabled: false
      },
      {
        label: `Streak: ${store.get('streakDays')} days`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow();
          } else {
            mainWindow.show();
          }
        }
      },
      {
        label: 'Start at login',
        type: 'checkbox',
        checked: store.get('autoLaunchEnabled'),
        click: async (menuItem) => {
          const enabled = menuItem.checked;
          store.set('autoLaunchEnabled', enabled);

          try {
            if (enabled) {
              await autoLauncher.enable();
            } else {
              await autoLauncher.disable();
            }
          } catch (error) {
            console.error('Failed to update auto-launch:', error);
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);
    tray?.setContextMenu(updatedMenu);
  }, 5000); // Update every 5 seconds
};

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../renderer/assets/icon.png'),
    title: 'TypeCount Dashboard'
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Don't open DevTools in production
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Send initial data to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('initial-data', {
      total: store.get('totalKeystrokes'),
      session: store.get('currentSessionKeystrokes'),
      today: getTodayKeystrokes(),
      dailyData: store.get('dailyKeystrokes'),
      hourlyData: store.get('hourlyKeystrokes'),
      achievements: store.get('achievements'),
      streak: store.get('streakDays'),
      firstUsedDate: store.get('firstUsedDate') || new Date().toISOString()
    });
  });
};

// IPC handler for request-data
ipcMain.on('request-data', (event) => {
  event.reply('initial-data', {
    total: store.get('totalKeystrokes'),
    session: store.get('currentSessionKeystrokes'),
    today: getTodayKeystrokes(),
    dailyData: store.get('dailyKeystrokes'),
    hourlyData: store.get('hourlyKeystrokes'),
    achievements: store.get('achievements'),
    streak: store.get('streakDays'),
    firstUsedDate: store.get('firstUsedDate') || new Date().toISOString()
  });
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  // Request permissions on macOS
  if (process.platform === 'darwin') {
    requestAccessibilityPermissions();
  }

  // Create tray icon
  createTray();

  // Start tracking keystrokes
  startKeystrokeTracking();

  // Set up auto-launch based on user preference
  const autoLaunchEnabled = store.get('autoLaunchEnabled');
  try {
    const isEnabled = await autoLauncher.isEnabled();
    if (autoLaunchEnabled && !isEnabled) {
      await autoLauncher.enable();
    } else if (!autoLaunchEnabled && isEnabled) {
      await autoLauncher.disable();
    }
  } catch (error) {
    console.error('Failed to set up auto-launch:', error);
  }

  // Don't show window on startup, only tray
  // User can open dashboard from tray menu

  // Reset session count
  store.set('currentSessionKeystrokes', 0);

  // Set up auto-updater
  setupAutoUpdater();
});

// Prevent app from quitting when window is closed
app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
  // App keeps running in the background
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Clean up on quit
app.on('before-quit', () => {
  stopKeystrokeTracking();
});

// Handle app updates
app.on('will-quit', () => {
  // Save any pending data
  store.set('currentSessionKeystrokes', 0);
});
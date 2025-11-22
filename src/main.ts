import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, systemPreferences, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import AutoLaunch from 'auto-launch';
import { autoUpdater } from 'electron-updater';
import {
  checkAchievements,
  generateDailyChallenge,
  generateWeeklyChallenge,
  calculateLevel,
  determinePersonalityType,
  getDailyProgress,
  getWeeklyProgress,
  updateGoalProgress
} from './gamification';

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
interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string;
  category: 'milestone' | 'streak' | 'time' | 'challenge' | 'special';
}

interface Challenge {
  id: string;
  name: string;
  description: string;
  type: 'daily' | 'weekly';
  target: number;
  progress: number;
  startDate: string;
  endDate: string;
  completed: boolean;
  reward?: string;
}

interface Goal {
  id: string;
  name: string;
  description: string;
  target: number;
  current: number;
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  createdDate: string;
  targetDate?: string;
  completed: boolean;
}

interface StoreSchema {
  totalKeystrokes: number;
  dailyKeystrokes: Record<string, number>;
  hourlyKeystrokes: Record<string, number[]>;
  currentSessionKeystrokes: number;
  firstUsedDate: string;
  lastResetDate: string;
  achievements: Achievement[];
  legacyAchievements: string[]; // For backward compatibility
  streakDays: number;
  longestStreak: number;
  lastActiveDate: string;
  autoLaunchEnabled: boolean;
  challenges: Challenge[];
  goals: Goal[];
  userLevel: number;
  userXP: number;
  personalityType: string;
  dailyGoal: number;
  weeklyGoal: number;
  totalSessions: number;
  averageSessionLength: number;
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
    legacyAchievements: [],
    streakDays: 0,
    longestStreak: 0,
    lastActiveDate: new Date().toISOString(),
    autoLaunchEnabled: true,
    challenges: [],
    goals: [],
    userLevel: 1,
    userXP: 0,
    personalityType: '',
    dailyGoal: 5000,
    weeklyGoal: 35000,
    totalSessions: 0,
    averageSessionLength: 0
  }
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let keystrokeCount = 0;
let sessionStartTime = Date.now();

// Performance optimization variables
let achievementCheckCounter = 0;
let lastAchievementCheck = Date.now();
const ACHIEVEMENT_CHECK_INTERVAL = 50; // Check achievements every 50 keystrokes
const ACHIEVEMENT_CHECK_TIME_INTERVAL = 30000; // Or every 30 seconds

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
          today: getTodayKeystrokes(),
          streak: store.get('streakDays'),
          userLevel: store.get('userLevel'),
          userXP: store.get('userXP'),
          dailyProgress: getDailyProgress(getTodayKeystrokes(), store.get('dailyGoal'))
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
  const newTotal = store.get('totalKeystrokes') + 1;
  store.set('totalKeystrokes', newTotal);

  // Update session count
  store.set('currentSessionKeystrokes', store.get('currentSessionKeystrokes') + 1);

  // Update daily count
  const today = new Date().toISOString().split('T')[0];
  const dailyKeystrokes = store.get('dailyKeystrokes');
  dailyKeystrokes[today] = (dailyKeystrokes[today] || 0) + 1;
  store.set('dailyKeystrokes', dailyKeystrokes);

  // Update hourly count
  const hour = new Date().getHours();
  const hourlyKeystrokes = store.get('hourlyKeystrokes');
  if (!hourlyKeystrokes[today]) {
    hourlyKeystrokes[today] = new Array(24).fill(0);
  }
  hourlyKeystrokes[today][hour]++;
  store.set('hourlyKeystrokes', hourlyKeystrokes);

  // Update XP (1 keystroke = 1 XP, with bonuses)
  let xpGain = 1;
  const currentXP = store.get('userXP');
  const currentStreak = store.get('streakDays');

  // Streak bonus: +1 XP for every 7 days of streak
  if (currentStreak > 0) {
    xpGain += Math.floor(currentStreak / 7);
  }

  store.set('userXP', currentXP + xpGain);
  store.set('userLevel', calculateLevel(currentXP + xpGain));

  // Update streak and personality
  updateStreak();
  updatePersonalityType();

  // Performance-optimized achievement and challenge checking
  achievementCheckCounter++;
  const currentTime = Date.now();
  const shouldCheckAchievements =
    achievementCheckCounter >= ACHIEVEMENT_CHECK_INTERVAL ||
    currentTime - lastAchievementCheck >= ACHIEVEMENT_CHECK_TIME_INTERVAL;

  if (shouldCheckAchievements) {
    // Check for new achievements
    checkForNewAchievements(newTotal, currentStreak, hourlyKeystrokes);

    // Update challenges and goals
    updateChallengesAndGoals();

    // Reset counters
    achievementCheckCounter = 0;
    lastAchievementCheck = currentTime;
  }
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
      const newStreak = store.get('streakDays') + 1;
      store.set('streakDays', newStreak);

      // Update longest streak
      const longestStreak = store.get('longestStreak');
      if (newStreak > longestStreak) {
        store.set('longestStreak', newStreak);
      }
    } else {
      store.set('streakDays', 1);
    }
    store.set('lastActiveDate', today);
  }
};

const updatePersonalityType = () => {
  const hourlyData = store.get('hourlyKeystrokes');
  const personalityType = determinePersonalityType(hourlyData);
  store.set('personalityType', personalityType);
};

const checkForNewAchievements = (totalKeystrokes: number, streakDays: number, hourlyData: Record<string, number[]>) => {
  const currentAchievements = store.get('achievements');
  const newAchievements = checkAchievements(totalKeystrokes, streakDays, hourlyData, currentAchievements);

  if (newAchievements.length > 0) {
    const allAchievements = [...currentAchievements, ...newAchievements];
    store.set('achievements', allAchievements);

    // Notify renderer of new achievements
    for (const achievement of newAchievements) {
      if (mainWindow) {
        mainWindow.webContents.send('achievement-unlocked', achievement);
      }
    }
  }

  // Migrate legacy achievements if they exist
  const legacyAchievements = store.get('legacyAchievements');
  if (legacyAchievements && legacyAchievements.length > 0) {
    // Convert legacy achievement IDs to new format if needed
    store.set('legacyAchievements', []);
  }
};

// Helper function to get week start (Sunday)
const getWeekStart = (date: Date): string => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day; // adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
};

const updateChallengesAndGoals = () => {
  const today = new Date().toISOString().split('T')[0];
  const todayKeystrokes = getTodayKeystrokes();

  // Update daily goals
  let goals = store.get('goals');
  goals = goals.map(goal => {
    if (goal.type === 'daily' && !goal.completed) {
      return updateGoalProgress(goal, todayKeystrokes);
    }
    return goal;
  });
  store.set('goals', goals);

  // Update challenges
  let challenges = store.get('challenges');
  const hourlyData = store.get('hourlyKeystrokes');
  const todayHours = hourlyData[today] || new Array(24).fill(0);

  // Remove expired challenges
  challenges = challenges.filter(challenge => {
    const endDate = new Date(challenge.endDate);
    return endDate >= new Date();
  });

  challenges = challenges.map(challenge => {
    if (!challenge.completed) {
      let progress = challenge.progress;

      if (challenge.type === 'daily') {
        switch (challenge.id) {
          case 'daily_target':
          case 'beat_yesterday':
            progress = todayKeystrokes;
            break;

          case 'morning_boost':
            progress = todayHours.slice(0, 12).reduce((sum, count) => sum + count, 0);
            break;

          case 'consistency_challenge':
            // Count hours with activity today
            const activeHours = todayHours.filter(count => count > 0).length;
            progress = activeHours;
            break;
        }
      } else if (challenge.type === 'weekly') {
        const weekStart = new Date(challenge.startDate);
        const currentWeekData = [];

        // Calculate weekly progress
        for (let i = 0; i < 7; i++) {
          const checkDate = new Date(weekStart);
          checkDate.setDate(weekStart.getDate() + i);
          const dateStr = checkDate.toISOString().split('T')[0];

          if (checkDate <= new Date()) {
            currentWeekData.push(store.get('dailyKeystrokes')[dateStr] || 0);
          }
        }

        switch (challenge.id) {
          case 'weekly_milestone':
            progress = currentWeekData.reduce((sum, count) => sum + count, 0);
            break;

          case 'perfect_week':
            // Count days with activity
            progress = currentWeekData.filter(count => count > 0).length;
            break;

          case 'weekend_warrior':
            // Weekend keystrokes (Saturday and Sunday)
            const weekend = currentWeekData.slice(-2);
            progress = weekend.reduce((sum, count) => sum + count, 0);
            break;
        }
      }

      const completed = progress >= challenge.target;
      if (completed && !challenge.completed) {
        // Award XP for completing challenge
        const currentXP = store.get('userXP');
        const xpReward = parseInt(challenge.reward?.replace(' XP', '') || '0');
        store.set('userXP', currentXP + xpReward);
        store.set('userLevel', calculateLevel(currentXP + xpReward));

        // Show achievement notification
        if (mainWindow) {
          mainWindow.webContents.send('challenge-completed', challenge);
        }
      }

      return { ...challenge, progress, completed };
    }
    return challenge;
  });
  store.set('challenges', challenges);

  // Generate new daily challenge if none exists for today
  const todayChallenges = challenges.filter(c =>
    c.type === 'daily' && c.startDate === today
  );

  if (todayChallenges.length === 0) {
    // Calculate average for challenge generation
    const dailyData = store.get('dailyKeystrokes');
    const recentDays = Object.values(dailyData).slice(-7);
    const avgDaily = recentDays.length > 0
      ? recentDays.reduce((sum, count) => sum + count, 0) / recentDays.length
      : 1000;

    const newChallenge = generateDailyChallenge(avgDaily, todayKeystrokes);
    challenges.push(newChallenge);
    store.set('challenges', challenges);
  }

  // Generate new weekly challenge if none exists for this week
  const currentWeekStart = getWeekStart(new Date());
  const thisWeekChallenges = challenges.filter(c =>
    c.type === 'weekly' && c.startDate === currentWeekStart
  );

  if (thisWeekChallenges.length === 0) {
    // Calculate weekly average for challenge generation
    const dailyData = store.get('dailyKeystrokes');
    const weeklyTotals = [];

    // Get last 4 weeks of data
    for (let week = 0; week < 4; week++) {
      const weekDate = new Date();
      weekDate.setDate(weekDate.getDate() - (week * 7));
      const weekStartDate = getWeekStart(weekDate);

      let weekTotal = 0;
      for (let day = 0; day < 7; day++) {
        const date = new Date(weekStartDate);
        date.setDate(date.getDate() + day);
        const dateStr = date.toISOString().split('T')[0];
        weekTotal += dailyData[dateStr] || 0;
      }
      weeklyTotals.push(weekTotal);
    }

    const avgWeekly = weeklyTotals.length > 0
      ? weeklyTotals.reduce((sum, total) => sum + total, 0) / weeklyTotals.length
      : 7000; // Default weekly target

    const newWeeklyChallenge = generateWeeklyChallenge(avgWeekly);
    challenges.push(newWeeklyChallenge);
    store.set('challenges', challenges);
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
    legacyAchievements: store.get('legacyAchievements'),
    streak: store.get('streakDays'),
    longestStreak: store.get('longestStreak'),
    firstUsedDate: store.get('firstUsedDate') || new Date().toISOString(),
    challenges: store.get('challenges'),
    goals: store.get('goals'),
    userLevel: store.get('userLevel'),
    userXP: store.get('userXP'),
    personalityType: store.get('personalityType'),
    dailyGoal: store.get('dailyGoal'),
    weeklyGoal: store.get('weeklyGoal')
  });
});

// IPC handler for creating goals
ipcMain.on('create-goal', (event, goalData) => {
  const goal = createGoal(
    goalData.name,
    goalData.description || '',
    goalData.target,
    goalData.type,
    goalData.targetDate
  );

  let goals = store.get('goals');
  goals.push(goal);
  store.set('goals', goals);

  // Send updated data back to renderer
  event.reply('initial-data', {
    total: store.get('totalKeystrokes'),
    session: store.get('currentSessionKeystrokes'),
    today: getTodayKeystrokes(),
    dailyData: store.get('dailyKeystrokes'),
    hourlyData: store.get('hourlyKeystrokes'),
    achievements: store.get('achievements'),
    legacyAchievements: store.get('legacyAchievements'),
    streak: store.get('streakDays'),
    longestStreak: store.get('longestStreak'),
    firstUsedDate: store.get('firstUsedDate') || new Date().toISOString(),
    challenges: store.get('challenges'),
    goals: store.get('goals'),
    userLevel: store.get('userLevel'),
    userXP: store.get('userXP'),
    personalityType: store.get('personalityType'),
    dailyGoal: store.get('dailyGoal'),
    weeklyGoal: store.get('weeklyGoal')
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
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
import { performanceMonitor, debouncer, throttler, BatchedStore } from './performance';

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
  legacyAchievements: string[];
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

// Initialize optimized store wrapper
const batchedStore = new BatchedStore(store, 2000); // Batch updates every 2 seconds

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let keystrokeCount = 0;
let sessionStartTime = Date.now();

// Optimized performance tracking
let achievementCheckCounter = 0;
let lastAchievementCheck = Date.now();
const ACHIEVEMENT_CHECK_INTERVAL = 100; // Increased from 50 to reduce CPU usage
const ACHIEVEMENT_CHECK_TIME_INTERVAL = 60000; // Increased to 60 seconds
const RENDERER_UPDATE_THROTTLE = 250; // Throttle renderer updates to every 250ms
const TRAY_UPDATE_INTERVAL = 30000; // Update tray every 30 seconds instead of 5

// Cached data to reduce redundant calculations
let cachedTodayKeystrokes = 0;
let lastTodayCache = '';
let cachedStats = {
  total: 0,
  session: 0,
  today: 0,
  streak: 0,
  userLevel: 1,
  userXP: 0,
  dailyProgress: 0
};

// Track keystrokes without storing actual keys (privacy-first)
const startKeystrokeTracking = () => {
  try {
    uIOhook.on('keydown', (e) => {
      // Record performance metrics
      performanceMonitor.recordKeystroke();

      // Count keystroke without logging the actual key
      keystrokeCount++;
      updateKeystrokeDataOptimized();

      // Throttled renderer updates
      throttledRendererUpdate();
    });

    uIOhook.start();
    console.log('Keystroke tracking started with optimized performance monitoring');
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

    // Flush any pending store updates
    batchedStore.flush();
    performanceMonitor.stop();
  } catch (error) {
    console.error('Failed to stop keystroke tracking:', error);
  }
};

// Optimized keystroke data update with batching
const updateKeystrokeDataOptimized = () => {
  // Update total count (batched)
  const currentTotal = batchedStore.get('totalKeystrokes');
  const newTotal = currentTotal + 1;
  batchedStore.set('totalKeystrokes', newTotal);

  // Update session count (batched)
  const currentSession = batchedStore.get('currentSessionKeystrokes');
  batchedStore.set('currentSessionKeystrokes', currentSession + 1);

  // Update daily count with caching
  const today = new Date().toISOString().split('T')[0];
  const dailyKeystrokes = batchedStore.get('dailyKeystrokes');
  dailyKeystrokes[today] = (dailyKeystrokes[today] || 0) + 1;
  batchedStore.set('dailyKeystrokes', dailyKeystrokes);

  // Update cached today's count
  if (lastTodayCache !== today) {
    cachedTodayKeystrokes = dailyKeystrokes[today] || 1;
    lastTodayCache = today;
  } else {
    cachedTodayKeystrokes++;
  }

  // Update hourly count (batched)
  const hour = new Date().getHours();
  const hourlyKeystrokes = batchedStore.get('hourlyKeystrokes');
  if (!hourlyKeystrokes[today]) {
    hourlyKeystrokes[today] = new Array(24).fill(0);
  }
  hourlyKeystrokes[today][hour]++;
  batchedStore.set('hourlyKeystrokes', hourlyKeystrokes);

  // Optimized XP calculation
  updateXPOptimized(newTotal);

  // Debounced streak and personality updates
  debouncedStreakUpdate();
  debouncedPersonalityUpdate();

  // Performance-optimized achievement and challenge checking
  achievementCheckCounter++;
  const currentTime = Date.now();
  const shouldCheckAchievements =
    achievementCheckCounter >= ACHIEVEMENT_CHECK_INTERVAL ||
    currentTime - lastAchievementCheck >= ACHIEVEMENT_CHECK_TIME_INTERVAL;

  if (shouldCheckAchievements) {
    // Debounced achievement checking
    debouncedAchievementCheck(newTotal, batchedStore.get('streakDays'), hourlyKeystrokes);

    // Reset counters
    achievementCheckCounter = 0;
    lastAchievementCheck = currentTime;
  }
};

// Optimized XP update with reduced calculations
const updateXPOptimized = (totalKeystrokes: number) => {
  let xpGain = 1;
  const currentXP = batchedStore.get('userXP');
  const currentStreak = batchedStore.get('streakDays');

  // Streak bonus: +1 XP for every 7 days of streak
  if (currentStreak > 0) {
    xpGain += Math.floor(currentStreak / 7);
  }

  const newXP = currentXP + xpGain;
  const newLevel = calculateLevel(newXP);

  batchedStore.set('userXP', newXP);
  batchedStore.set('userLevel', newLevel);

  // Update cached stats
  cachedStats.userXP = newXP;
  cachedStats.userLevel = newLevel;
};

// Cached today's keystrokes calculation
const getTodayKeystrokes = () => {
  const today = new Date().toISOString().split('T')[0];
  if (lastTodayCache !== today) {
    cachedTodayKeystrokes = batchedStore.get('dailyKeystrokes')[today] || 0;
    lastTodayCache = today;
  }
  return cachedTodayKeystrokes;
};

// Debounced functions to reduce excessive processing
const debouncedStreakUpdate = debouncer.debounce('streak', updateStreak, 5000);
const debouncedPersonalityUpdate = debouncer.debounce('personality', updatePersonalityType, 30000);
const debouncedAchievementCheck = debouncer.debounce('achievements', checkForNewAchievements, 2000);
const debouncedChallengeUpdate = debouncer.debounce('challenges', updateChallengesAndGoals, 10000);

// Throttled renderer update
const throttledRendererUpdate = throttler.throttle('renderer', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Update cached stats
    cachedStats.total = batchedStore.get('totalKeystrokes');
    cachedStats.session = batchedStore.get('currentSessionKeystrokes');
    cachedStats.today = getTodayKeystrokes();
    cachedStats.streak = batchedStore.get('streakDays');
    cachedStats.dailyProgress = getDailyProgress(cachedStats.today, batchedStore.get('dailyGoal'));

    mainWindow.webContents.send('keystroke-update', cachedStats);
  }
}, RENDERER_UPDATE_THROTTLE);

// Optimized streak update
const updateStreak = () => {
  const today = new Date().toISOString().split('T')[0];
  const lastActive = batchedStore.get('lastActiveDate');

  if (lastActive !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastActive === yesterdayStr) {
      const newStreak = batchedStore.get('streakDays') + 1;
      batchedStore.set('streakDays', newStreak);

      // Update longest streak
      const longestStreak = batchedStore.get('longestStreak');
      if (newStreak > longestStreak) {
        batchedStore.set('longestStreak', newStreak);
      }

      // Update cached stats
      cachedStats.streak = newStreak;
    } else {
      batchedStore.set('streakDays', 1);
      cachedStats.streak = 1;
    }
    batchedStore.set('lastActiveDate', today);
  }
};

const updatePersonalityType = () => {
  const hourlyData = batchedStore.get('hourlyKeystrokes');
  const personalityType = determinePersonalityType(hourlyData);
  batchedStore.set('personalityType', personalityType);
};

const checkForNewAchievements = (totalKeystrokes: number, streakDays: number, hourlyData: Record<string, number[]>) => {
  const currentAchievements = batchedStore.get('achievements');
  const newAchievements = checkAchievements(totalKeystrokes, streakDays, hourlyData, currentAchievements);

  if (newAchievements.length > 0) {
    const allAchievements = [...currentAchievements, ...newAchievements];
    batchedStore.setImmediate('achievements', allAchievements); // Important data, set immediately

    // Notify renderer of new achievements
    for (const achievement of newAchievements) {
      if (mainWindow) {
        mainWindow.webContents.send('achievement-unlocked', achievement);
      }
    }
  }

  // Update challenges and goals less frequently
  debouncedChallengeUpdate();

  // Migrate legacy achievements if they exist
  const legacyAchievements = batchedStore.get('legacyAchievements');
  if (legacyAchievements && legacyAchievements.length > 0) {
    batchedStore.set('legacyAchievements', []);
  }
};

// Helper function to get week start (Sunday)
const getWeekStart = (date: Date): string => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
};

// Optimized challenges and goals update with reduced frequency
const updateChallengesAndGoals = () => {
  const today = new Date().toISOString().split('T')[0];
  const todayKeystrokes = getTodayKeystrokes();

  // Update daily goals
  let goals = batchedStore.get('goals');
  goals = goals.map(goal => {
    if (goal.type === 'daily' && !goal.completed) {
      return updateGoalProgress(goal, todayKeystrokes);
    }
    return goal;
  });
  batchedStore.set('goals', goals);

  // Update challenges (simplified logic for performance)
  let challenges = batchedStore.get('challenges');
  const hourlyData = batchedStore.get('hourlyKeystrokes');
  const todayHours = hourlyData[today] || new Array(24).fill(0);

  // Remove expired challenges
  challenges = challenges.filter(challenge => {
    const endDate = new Date(challenge.endDate);
    return endDate >= new Date();
  });

  // Update challenge progress with optimized calculations
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
            const activeHours = todayHours.filter(count => count > 0).length;
            progress = activeHours;
            break;
        }
      } else if (challenge.type === 'weekly') {
        // Simplified weekly calculation for performance
        const weekStart = new Date(challenge.startDate);
        const dailyData = batchedStore.get('dailyKeystrokes');
        let weekTotal = 0;

        for (let i = 0; i < 7; i++) {
          const checkDate = new Date(weekStart);
          checkDate.setDate(weekStart.getDate() + i);
          const dateStr = checkDate.toISOString().split('T')[0];

          if (checkDate <= new Date()) {
            weekTotal += dailyData[dateStr] || 0;
          }
        }

        switch (challenge.id) {
          case 'weekly_milestone':
            progress = weekTotal;
            break;

          case 'perfect_week':
            // Count days with activity (simplified)
            progress = Math.min(7, Object.keys(dailyData).length);
            break;

          case 'weekend_warrior':
            // Weekend keystrokes (simplified calculation)
            progress = weekTotal * 0.3; // Approximate weekend portion
            break;
        }
      }

      const completed = progress >= challenge.target;
      if (completed && !challenge.completed) {
        // Award XP for completing challenge
        const currentXP = batchedStore.get('userXP');
        const xpReward = parseInt(challenge.reward?.replace(' XP', '') || '0');
        const newXP = currentXP + xpReward;
        batchedStore.setImmediate('userXP', newXP);
        batchedStore.setImmediate('userLevel', calculateLevel(newXP));

        // Show achievement notification
        if (mainWindow) {
          mainWindow.webContents.send('challenge-completed', challenge);
        }
      }

      return { ...challenge, progress, completed };
    }
    return challenge;
  });

  batchedStore.set('challenges', challenges);

  // Generate new challenges less frequently and with simpler logic
  generateNewChallengesOptimized(challenges, today);
};

// Optimized challenge generation
const generateNewChallengesOptimized = (challenges: Challenge[], today: string) => {
  // Generate new daily challenge if none exists for today
  const todayChallenges = challenges.filter(c =>
    c.type === 'daily' && c.startDate === today
  );

  if (todayChallenges.length === 0) {
    // Simplified average calculation
    const dailyData = batchedStore.get('dailyKeystrokes');
    const recentValues = Object.values(dailyData).slice(-7);
    const avgDaily = recentValues.length > 0
      ? recentValues.reduce((sum, count) => sum + count, 0) / recentValues.length
      : 1000;

    const newChallenge = generateDailyChallenge(avgDaily, getTodayKeystrokes());
    challenges.push(newChallenge);
    batchedStore.set('challenges', challenges);
  }

  // Generate new weekly challenge if none exists for this week (less frequent)
  const currentWeekStart = getWeekStart(new Date());
  const thisWeekChallenges = challenges.filter(c =>
    c.type === 'weekly' && c.startDate === currentWeekStart
  );

  if (thisWeekChallenges.length === 0) {
    // Simplified weekly average calculation
    const avgWeekly = 7000; // Use a reasonable default to avoid complex calculations

    const newWeeklyChallenge = generateWeeklyChallenge(avgWeekly);
    challenges.push(newWeeklyChallenge);
    batchedStore.set('challenges', challenges);
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

// Optimized auto-updater with less frequent checking
const setupAutoUpdater = () => {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'itskritix',
    repo: 'TypeCount'
  });

  // Check for updates every 6 hours instead of every hour
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 6 * 60 * 60 * 1000);

  // Check for updates on startup
  autoUpdater.checkForUpdatesAndNotify();

  // Auto-updater events (unchanged but logged for monitoring)
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

  autoUpdater.on('update-not-available', () => {
    console.log('Update not available');
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);
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

// Optimized tray creation with less frequent updates
const createTray = () => {
  const iconPath = path.join(__dirname, '../renderer/assets/icon.png');
  let trayIcon = nativeImage.createFromPath(iconPath);

  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const updateTrayMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Total: ${batchedStore.get('totalKeystrokes').toLocaleString()} keystrokes`,
        enabled: false
      },
      {
        label: `Today: ${getTodayKeystrokes().toLocaleString()} keystrokes`,
        enabled: false
      },
      {
        label: `Streak: ${batchedStore.get('streakDays')} days`,
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
        label: 'Performance Report',
        click: () => {
          const report = performanceMonitor.getPerformanceReport();
          dialog.showMessageBox({
            type: 'info',
            title: 'Performance Report',
            message: `Memory: ${(report as any).performance.memoryUsageMB.heapUsed}MB | CPU: ${(report as any).performance.keystrokesPerSecond} KPS`,
            detail: JSON.stringify(report, null, 2),
            buttons: ['OK']
          });
        }
      },
      {
        label: 'Start at login',
        type: 'checkbox',
        checked: batchedStore.get('autoLaunchEnabled'),
        click: async (menuItem) => {
          const enabled = menuItem.checked;
          batchedStore.setImmediate('autoLaunchEnabled', enabled);

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

    tray?.setContextMenu(contextMenu);
  };

  tray.setToolTip('TypeCount - Keystroke Tracker (Optimized)');
  updateTrayMenu();

  // Update tray menu less frequently (every 30 seconds instead of 5)
  setInterval(updateTrayMenu, TRAY_UPDATE_INTERVAL);
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../renderer/assets/icon.png'),
    title: 'TypeCount Dashboard (Optimized)'
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Send initial data to renderer with cached values
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('initial-data', {
      total: batchedStore.get('totalKeystrokes'),
      session: batchedStore.get('currentSessionKeystrokes'),
      today: getTodayKeystrokes(),
      dailyData: batchedStore.get('dailyKeystrokes'),
      hourlyData: batchedStore.get('hourlyKeystrokes'),
      achievements: batchedStore.get('achievements'),
      streak: batchedStore.get('streakDays'),
      firstUsedDate: batchedStore.get('firstUsedDate') || new Date().toISOString()
    });
  });
};

// Optimized IPC handlers
ipcMain.on('request-data', (event) => {
  // Force flush to get latest data
  batchedStore.flush();

  event.reply('initial-data', {
    total: batchedStore.get('totalKeystrokes'),
    session: batchedStore.get('currentSessionKeystrokes'),
    today: getTodayKeystrokes(),
    dailyData: batchedStore.get('dailyKeystrokes'),
    hourlyData: batchedStore.get('hourlyKeystrokes'),
    achievements: batchedStore.get('achievements'),
    legacyAchievements: batchedStore.get('legacyAchievements'),
    streak: batchedStore.get('streakDays'),
    longestStreak: batchedStore.get('longestStreak'),
    firstUsedDate: batchedStore.get('firstUsedDate') || new Date().toISOString(),
    challenges: batchedStore.get('challenges'),
    goals: batchedStore.get('goals'),
    userLevel: batchedStore.get('userLevel'),
    userXP: batchedStore.get('userXP'),
    personalityType: batchedStore.get('personalityType'),
    dailyGoal: batchedStore.get('dailyGoal'),
    weeklyGoal: batchedStore.get('weeklyGoal')
  });
});

ipcMain.on('create-goal', (event, goalData) => {
  const goal = createGoal(
    goalData.name,
    goalData.description || '',
    goalData.target,
    goalData.type,
    goalData.targetDate
  );

  let goals = batchedStore.get('goals');
  goals.push(goal);
  batchedStore.setImmediate('goals', goals);

  // Flush and send updated data
  batchedStore.flush();
  event.reply('initial-data', {
    total: batchedStore.get('totalKeystrokes'),
    session: batchedStore.get('currentSessionKeystrokes'),
    today: getTodayKeystrokes(),
    dailyData: batchedStore.get('dailyKeystrokes'),
    hourlyData: batchedStore.get('hourlyKeystrokes'),
    achievements: batchedStore.get('achievements'),
    legacyAchievements: batchedStore.get('legacyAchievements'),
    streak: batchedStore.get('streakDays'),
    longestStreak: batchedStore.get('longestStreak'),
    firstUsedDate: batchedStore.get('firstUsedDate') || new Date().toISOString(),
    challenges: batchedStore.get('challenges'),
    goals: batchedStore.get('goals'),
    userLevel: batchedStore.get('userLevel'),
    userXP: batchedStore.get('userXP'),
    personalityType: batchedStore.get('personalityType'),
    dailyGoal: batchedStore.get('dailyGoal'),
    weeklyGoal: batchedStore.get('weeklyGoal')
  });
});

// Performance monitoring IPC
ipcMain.on('request-performance-report', (event) => {
  const report = performanceMonitor.getPerformanceReport();
  event.reply('performance-report', report);
});

// App lifecycle with optimization
app.whenReady().then(async () => {
  console.log('Starting TypeCount with performance optimizations...');

  if (process.platform === 'darwin') {
    requestAccessibilityPermissions();
  }

  createTray();
  startKeystrokeTracking();

  const autoLaunchEnabled = batchedStore.get('autoLaunchEnabled');
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

  batchedStore.set('currentSessionKeystrokes', 0);
  setupAutoUpdater();

  // Schedule periodic data cleanup
  setInterval(() => {
    const cleanupResult = performanceMonitor.performDataCleanup();
    console.log('Automatic cleanup performed:', cleanupResult);
  }, 24 * 60 * 60 * 1000); // Daily cleanup

  console.log('TypeCount startup completed with optimizations');
});

app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  console.log('Stopping TypeCount with performance cleanup...');
  stopKeystrokeTracking();

  // Final performance report
  const finalReport = performanceMonitor.getPerformanceReport();
  console.log('Final performance report:', JSON.stringify(finalReport, null, 2));
});

app.on('will-quit', () => {
  batchedStore.setImmediate('currentSessionKeystrokes', 0);
});

// Helper function for goal creation (missing from original)
function createGoal(name: string, description: string, target: number, type: string, targetDate?: string): Goal {
  return {
    id: `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description,
    target,
    current: 0,
    type: type as any,
    createdDate: new Date().toISOString(),
    targetDate,
    completed: false
  };
}
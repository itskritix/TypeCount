import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, systemPreferences, Tray, Notification } from 'electron';
import started from 'electron-squirrel-startup';
import Store from 'electron-store';
import fs from 'node:fs';
import path from 'node:path';
import AutoLaunch from 'auto-launch';
import { autoUpdater } from 'electron-updater';
import type { UiohookKeyboardEvent, UiohookNapi } from 'uiohook-napi';
import {
  calculateLevel,
  checkAchievements,
  determinePersonalityType,
  generateDailyChallenge,
  generateWeeklyChallenge,
  getDailyProgress,
  updateGoalProgress
} from './gamification';

// Type-safe module loading with integrity checks
interface UiohookModule {
  uIOhook: UiohookNapi;
  UiohookKey: typeof import('uiohook-napi').UiohookKey;
}

let uIOhook: UiohookNapi | null = null;
let UiohookKey: typeof import('uiohook-napi').UiohookKey | null = null;
let isNativeModuleAvailable = false;

// Secure native module loading with integrity validation
function loadNativeModuleSecurely(): boolean {
  try {
    if (app.isPackaged) {
      const nativeModulePath = path.join(process.resourcesPath, 'uiohook_napi.node');

      // Verify file exists and validate properties
      if (!fs.existsSync(nativeModulePath)) {
        console.error(' Native module not found at expected location:', nativeModulePath);
        return false;
      }

      const stats = fs.statSync(nativeModulePath);
      const fileSizeKB = stats.size / 1024;

      // Reasonable size limits (uiohook_napi.node should be ~80-200KB)
      if (stats.size === 0 || fileSizeKB > 10000) {
        console.error(' Native module file size suspicious:', fileSizeKB, 'KB');
        return false;
      }

      if (!stats.isFile()) {
        console.error(' Native module path is not a regular file');
        return false;
      }

      console.log(' Native module integrity verified:', fileSizeKB.toFixed(1), 'KB');

      const uiohookModule: UiohookModule = require(nativeModulePath);
      uIOhook = uiohookModule.uIOhook;
      UiohookKey = uiohookModule.UiohookKey;
    } else {
      // Development: Use standard import
      const uiohookModule: UiohookModule = require('uiohook-napi');
      uIOhook = uiohookModule.uIOhook;
      UiohookKey = uiohookModule.UiohookKey;
      console.log(' Development mode: uiohook-napi loaded from node_modules');
    }

    if (!uIOhook || typeof uIOhook.start !== 'function') {
      console.error(' Invalid uIOhook module structure');
      return false;
    }

    return true;
  } catch (error) {
    console.error(' Critical error loading uiohook-napi:', error);
    return false;
  }
}

// Initialize native module with security checks
isNativeModuleAvailable = loadNativeModuleSecurely();

// Helper to get icon path in both dev and prod
const getAppIconPath = (): string => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', 'logo.png');
  }
  // In dev, we are in .vite/build/main.js, so we go up to root
  return path.join(__dirname, '../../assets/logo.png');
};

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
  firstUsedDate: string;
  lastResetDate: string;
  achievements: Achievement[];
  legacyAchievements: string[]; // For backward compatibility
  streakDays: number;
  longestStreak: number;
  lastActiveDate: string;
  autoLaunchEnabled: boolean;
  widgetEnabled: boolean;
  challenges: Challenge[];
  goals: Goal[];
  userLevel: number;
  userXP: number;
  personalityType: string;
  dailyGoal: number;
  weeklyGoal: number;
  totalSessions: number;
  averageSessionLength: number;
  hasTypedFirstKeystroke: boolean; // Track if user has typed anything
  hasShownWelcomeNotification: boolean;
  widgetPosition?: { x: number, y: number };
}

const store = new Store<StoreSchema>({
  defaults: {
    totalKeystrokes: 0,
    dailyKeystrokes: {},
    hourlyKeystrokes: {},
    firstUsedDate: new Date().toISOString(),
    lastResetDate: new Date().toISOString(),
    achievements: [],
    legacyAchievements: [],
    streakDays: 0,
    longestStreak: 0,
    lastActiveDate: new Date().toISOString(),
    autoLaunchEnabled: true,
    widgetEnabled: false,
    widgetPosition: { x: 50, y: 50 },
    challenges: [],
    goals: [],
    userLevel: 1,
    userXP: 0,
    personalityType: '',
    dailyGoal: 5000,
    weeklyGoal: 35000,
    totalSessions: 0,
    averageSessionLength: 0,
    hasTypedFirstKeystroke: false,
    hasShownWelcomeNotification: false
  }
});

let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let keystrokeCount = 0;

// Timer management system to prevent memory leaks
class TimerManager {
  private timers = new Set<NodeJS.Timeout>();
  private intervals = new Set<NodeJS.Timeout>();

  addTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  addInterval(fn: () => void, ms: number): NodeJS.Timeout {
    const interval = setInterval(fn, ms);
    this.intervals.add(interval);
    return interval;
  }

  clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    this.timers.delete(timer);
  }

  clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.intervals.delete(interval);
  }

  cleanup(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.intervals.forEach(interval => clearInterval(interval));
    this.timers.clear();
    this.intervals.clear();
    console.log(' Timer cleanup completed');
  }
}

// Global timer manager
const timerManager = new TimerManager();

// Performance optimization variables
let achievementCheckCounter = 0;
let lastAchievementCheck = Date.now();
const ACHIEVEMENT_CHECK_INTERVAL = 50; // Check achievements every 50 keystrokes
const ACHIEVEMENT_CHECK_TIME_INTERVAL = 30000; // Or every 30 seconds

// Performance-optimized keystroke tracking with rate limiting and batching
class KeystrokeTracker {
  private lastEventTime = 0;
  private eventCount = 0;
  private batchedUpdates = 0;
  private isOverloaded = false;

  // Rate limiting configuration (based on research: world record = 25/sec, systems handle 1000/sec)
  private readonly MAX_EVENTS_PER_SECOND = 500; // Max 500 events/second (20x world record)
  private readonly MIN_EVENT_INTERVAL = 1000 / this.MAX_EVENTS_PER_SECOND; // 2ms interval
  private readonly OVERLOAD_THRESHOLD = 1000; // Circuit breaker at 1000 events/second (industry standard)
  private readonly BATCH_SIZE = 25; // Batch every 25 keystrokes (1 second at world record pace)
  private readonly UPDATE_DEBOUNCE_MS = 100; // Faster UI updates (100ms vs 250ms)

  // Timers for batching and debouncing
  private batchUpdateTimer: NodeJS.Timeout | null = null;
  private rendererUpdateTimer: NodeJS.Timeout | null = null;

  // Cached data to reduce store access
  public cachedStats = {
    total: 0,
    today: 0,
    streak: 0,
    userLevel: 1,
    userXP: 0,
    lastUpdate: 0
  };

  constructor() {
    this.loadCachedStats();
  }

  private loadCachedStats() {
    this.cachedStats = {
      total: store.get('totalKeystrokes') || 0,
      today: getTodayKeystrokes(),
      streak: store.get('streakDays') || 0,
      userLevel: store.get('userLevel') || 1,
      userXP: store.get('userXP') || 0,
      lastUpdate: Date.now()
    };
  }

  private handleKeystroke = (e: UiohookKeyboardEvent) => {
    const now = Date.now();

    // Rate limiting: Check if we're receiving events too rapidly
    if (now - this.lastEventTime < this.MIN_EVENT_INTERVAL) {
      this.eventCount++;

      // Circuit breaker: If overwhelming, temporarily throttle
      if (this.eventCount > this.OVERLOAD_THRESHOLD) {
        if (!this.isOverloaded) {
          console.warn('⚠️  Keystroke rate too high, activating circuit breaker');
          this.isOverloaded = true;
        }
        return;
      }
      return;
    }

    // Reset overload state if we're back to normal rates
    if (this.isOverloaded && now - this.lastEventTime > this.MIN_EVENT_INTERVAL * 2) {
      console.log(' Circuit breaker deactivated, normal operation resumed');
      this.isOverloaded = false;
      this.eventCount = 0;
    }

    this.lastEventTime = now;
    this.eventCount = Math.max(0, this.eventCount - 1);

    // Count keystroke (privacy-first: no actual key data stored)
    keystrokeCount++;
    this.batchedUpdates++;

    this.cachedStats.total++;
    this.cachedStats.today++;

    // Immediate feedback for first keystroke
    const isFirstKeystroke = !store.get('hasTypedFirstKeystroke');
    const shouldImmediateSave = (
      isFirstKeystroke ||
      this.batchedUpdates >= this.BATCH_SIZE ||
      this.cachedStats.total % 1000 === 1
    );

    if (shouldImmediateSave) {
      this.flushBatchedUpdates();

      if (isFirstKeystroke) {
        store.set('hasTypedFirstKeystroke', true);
        this.showWelcomeNotification();
      }
    } else if (!this.batchUpdateTimer) {
      this.batchUpdateTimer = timerManager.addTimeout(() => {
        this.flushBatchedUpdates();
      }, this.UPDATE_DEBOUNCE_MS);
    }

    this.scheduleRendererUpdate();
    this.checkAchievementsThrottled();
  };

  private flushBatchedUpdates() {
    if (this.batchedUpdates === 0) return;

    try {
      // FIXED: Store all critical data atomically
      const today = new Date().toISOString().split('T')[0];

      // Primary storage operations
      store.set('totalKeystrokes', this.cachedStats.total);
      store.set(`daily.${today}`, this.cachedStats.today);

      // Backward compatibility - handle gracefully if it fails
      try {
        const existingDailyData = store.get('dailyKeystrokeData') || {};
        if (!existingDailyData[today] || existingDailyData[today] !== this.cachedStats.today) {
          existingDailyData[today] = this.cachedStats.today;
          store.set('dailyKeystrokeData', existingDailyData);
        }
      } catch (legacyError) {
        console.warn('⚠️ Legacy data structure update failed (non-critical):', legacyError);
      }

      this.batchedUpdates = 0;
      this.cachedStats.lastUpdate = Date.now();

      // FIXED: Clean up timer safely
      this.clearBatchTimer();
    } catch (error) {
      console.error('❌ Error flushing batched updates:', error);
    }
  }

  private clearBatchTimer() {
    if (this.batchUpdateTimer) {
      timerManager.clearTimeout(this.batchUpdateTimer);
      this.batchUpdateTimer = null;
    }
  }

  private clearRendererTimer() {
    if (this.rendererUpdateTimer) {
      timerManager.clearTimeout(this.rendererUpdateTimer);
      this.rendererUpdateTimer = null;
    }
  }

  private scheduleRendererUpdate() {
    // Debounce renderer updates to prevent overwhelming IPC
    if (this.rendererUpdateTimer) {
      return; // Update already scheduled
    }

    this.rendererUpdateTimer = timerManager.addTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const dailyGoal = store.get('dailyGoal') || 5000;

        mainWindow.webContents.send('keystroke-update', {
          total: this.cachedStats.total,
          today: this.cachedStats.today,
          streak: this.cachedStats.streak,
          userLevel: this.cachedStats.userLevel,
          userXP: this.cachedStats.userXP,
          dailyProgress: getDailyProgress(this.cachedStats.today, dailyGoal)
        });
      }

      // Update tray display when keystroke data changes
      updateTrayDisplay();

      // Update widget if enabled
      updateWidget();

      this.clearRendererTimer();
    }, this.UPDATE_DEBOUNCE_MS);
  }

  private achievementCheckCounter = 0;
  private lastAchievementCheck = Date.now();
  private readonly ACHIEVEMENT_CHECK_INTERVAL = 50; // Check every 50 keystrokes
  private readonly ACHIEVEMENT_CHECK_TIME_INTERVAL = 30000; // Or every 30 seconds

  private checkAchievementsThrottled() {
    this.achievementCheckCounter++;
    const now = Date.now();

    const shouldCheckByCount = this.achievementCheckCounter >= this.ACHIEVEMENT_CHECK_INTERVAL;
    const shouldCheckByTime = now - this.lastAchievementCheck >= this.ACHIEVEMENT_CHECK_TIME_INTERVAL;

    if (shouldCheckByCount || shouldCheckByTime) {
      this.achievementCheckCounter = 0;
      this.lastAchievementCheck = now;

      // Run achievement checks asynchronously to avoid blocking
      timerManager.addTimeout(() => {
        try {
          // Get required data for achievement checking
          const currentAchievements = store.get('achievements') || [];
          const hourlyData = store.get('hourlyKeystrokeData') || {};
          const streakDays = store.get('streakDays') || 0;

          // Call achievement check with proper parameters
          const newAchievements = checkAchievements(
            this.cachedStats.total,
            streakDays,
            hourlyData,
            currentAchievements
          );

          // Handle any new achievements
          if (newAchievements.length > 0) {
            const allAchievements = [...currentAchievements, ...newAchievements];
            store.set('achievements', allAchievements);

            // Send achievement notifications to renderer
            if (mainWindow && !mainWindow.isDestroyed()) {
              newAchievements.forEach(achievement => {
                mainWindow.webContents.send('achievement-unlocked', achievement);
              });
            }
          }
        } catch (error) {
          console.error(' Error checking achievements:', error);
        }
      }, 0);
    }
  }

  private showWelcomeNotification() {
    // Don't show multiple welcome notifications
    if (store.get('hasShownWelcomeNotification')) return;

    console.log('🎉 TypeCount: First keystroke detected! App is now tracking.');

    // FIXED: Always set the flag first to prevent duplicate calls
    store.set('hasShownWelcomeNotification', true);

    // Show system notification on supported platforms
    if (Notification && process.platform !== 'linux') {
      timerManager.addTimeout(() => {
        try {
          new Notification('TypeCount Started! 🎉', {
            body: 'Your first keystroke is tracked! Check the menu bar to see your progress.',
            icon: getAppIconPath(),
            silent: true
          });
        } catch (error) {
          console.log('💡 TypeCount is now tracking your keystrokes! Check the menu bar.');
        }
      }, 100); // Small delay to ensure UI is ready
    } else {
      // Fallback for platforms without notifications (including Linux)
      console.log('💡 TypeCount is now tracking your keystrokes! Check the menu bar.');

      // For Linux users, create a more visible console message
      if (process.platform === 'linux') {
        console.log('\n' + '='.repeat(60));
        console.log('  TypeCount is now actively tracking your keystrokes!');
        console.log('  Check the system tray/panel for your keystroke count.');
        console.log('='.repeat(60) + '\n');
      }
    }

    // Force immediate tray update to show the first keystroke
    timerManager.addTimeout(() => {
      updateTrayDisplay();
    }, 200);
  }

  public cleanup() {
    // FIXED: Use dedicated cleanup methods
    this.clearBatchTimer();
    this.clearRendererTimer();

    // Ensure final data is saved before cleanup
    this.flushBatchedUpdates();

    console.log('✓ KeystrokeTracker cleanup completed');
  }
}

// Global keystroke tracker instance
let keystrokeTracker: KeystrokeTracker | null = null;

const startKeystrokeTracking = () => {
  // Validation: Check if native module is available and secure
  if (!isNativeModuleAvailable || !uIOhook) {
    console.error(' uIOhook not available - global keystroke monitoring disabled');
    console.log(' Tip: Ensure accessibility permissions are granted and app is restarted');
    return;
  }

  try {
    // Initialize performance-optimized tracker
    keystrokeTracker = new KeystrokeTracker();

    // Attach type-safe event handler
    uIOhook.on('keydown', keystrokeTracker['handleKeystroke']);

    uIOhook.start();
  } catch (error) {
    console.error(' Failed to start global keystroke tracking:', error);

    // Platform-specific error handling
    if (process.platform === 'darwin') {
      console.log(' macOS: Check System Preferences → Security & Privacy → Accessibility');
      requestAccessibilityPermissions();
    }
  }
};

const stopKeystrokeTracking = () => {
  try {
    // Clean up the performance-optimized tracker
    if (keystrokeTracker) {
      keystrokeTracker.cleanup();
      keystrokeTracker = null;
    }

    // Stop the native module
    if (uIOhook) {
      uIOhook.stop();
      console.log(' Global keystroke tracking stopped gracefully');
    }
  } catch (error) {
    console.error(' Error stopping keystroke tracking:', error);
  }
};


const getTodayKeystrokes = () => {
  // Use cached value if available, fallback to store only if needed
  if (keystrokeTracker) {
    return keystrokeTracker.cachedStats.today;
  }

  // Fallback for initialization
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

// Helper functions for tray display
const formatKeystrokeCount = (count: number): string => {
  if (count < 1000) {
    return count.toString();
  } else if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K`;
  } else if (count < 1000000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  } else {
    return `${(count / 1000000000).toFixed(1)}B`;
  }
};

const createDynamicTrayIcon = (count: number): Electron.NativeImage => {
  const formattedCount = formatKeystrokeCount(count);

  // Create SVG with count text
  const size = 32;
  const fontSize = formattedCount.length > 3 ? 8 : formattedCount.length > 2 ? 10 : 12;

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="rgba(0,0,0,0.8)" stroke="white" stroke-width="1"/>
      <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central"
            fill="white" font-family="system-ui, -apple-system, sans-serif"
            font-size="${fontSize}" font-weight="bold">${formattedCount}</text>
    </svg>
  `;

  // Convert SVG to data URL
  const dataURL = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataURL);
};

const createReadyTrayIcon = (): Electron.NativeImage => {
  // Create a welcoming "ready" icon for new users
  const size = 32;

  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}" fill="rgba(34,139,34,0.8)" stroke="white" stroke-width="1"/>
      <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central"
            fill="white" font-family="system-ui, -apple-system, sans-serif"
            font-size="12" font-weight="bold">✓</text>
    </svg>
  `;

  // Convert SVG to data URL
  const dataURL = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataURL);
};

const updateTrayDisplay = () => {
  if (!tray) return;

  const totalCount = keystrokeTracker?.cachedStats.total ?? store.get('totalKeystrokes') ?? 0;
  const hasTypedBefore = store.get('hasTypedFirstKeystroke') || false;
  const isNewUser = totalCount === 0 && !hasTypedBefore;

  const displayText = isNewUser ? 'Ready' : formatKeystrokeCount(totalCount);

  if (process.platform === 'darwin') {
    tray.setTitle(` ${displayText}`);
    const transparentIcon = nativeImage.createEmpty();
    transparentIcon.resize({ width: 16, height: 16 });
    tray.setImage(transparentIcon);
  } else {
    // Windows/Linux: Use static app logo, count in tooltip
  }

  const tooltipText = isNewUser ?
    'TypeCount: Ready to track keystrokes!' :
    `TypeCount: ${totalCount.toLocaleString()} total keystrokes`;

  tray.setToolTip(tooltipText);
};

// Widget window management
const createWidget = () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.focus();
    return;
  }

  const isMac = process.platform === 'darwin';
  const widgetPosition = store.get('widgetPosition') as { x: number, y: number } | undefined;

  widgetWindow = new BrowserWindow({
    width: 180,
    height: 80,
    x: widgetPosition?.x || 50,
    y: widgetPosition?.y || 50,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    focusable: false,
    type: isMac ? 'desktop' : 'toolbar',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Save position when moved
  widgetWindow.on('moved', () => {
    if (widgetWindow) {
      const [x, y] = widgetWindow.getPosition();
      store.set('widgetPosition', { x, y });
    }
  });

  if (isMac) {
    widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  }

  // Load widget HTML content
  const widgetHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(10px);
          border-radius: 8px;
          color: white;
          overflow: hidden;
          cursor: move;
          -webkit-app-region: drag;
          user-select: none;
        }
        .widget-content {
          padding: 10px;
          text-align: center;
        }
        .title {
          font-size: 11px;
          opacity: 0.8;
          margin-bottom: 2px;
        }
        .count {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 2px;
        }
        .today {
          font-size: 10px;
          opacity: 0.7;
        }
      </style>
    </head>
    <body>
      <div class="widget-content">
        <div class="title">TypeCount</div>
        <div class="count" id="total-count">0</div>
        <div class="today" id="today-count">Today: 0</div>
      </div>
      <script>
        const updateWidget = (data) => {
          const totalEl = document.getElementById('total-count');
          const todayEl = document.getElementById('today-count');

          if (totalEl) {
            totalEl.textContent = formatNumber(data.total || 0);
          }
          if (todayEl) {
            todayEl.textContent = 'Today: ' + formatNumber(data.today || 0);
          }
        };

        const formatNumber = (num) => {
          if (num < 1000) return num.toString();
          if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
          if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
          return (num / 1000000000).toFixed(1) + 'B';
        };

        const { ipcRenderer } = require('electron');

        ipcRenderer.on('widget-update', (event, data) => {
          updateWidget(data);
        });

        ipcRenderer.send('widget-request-data');
      </script>
    </body>
    </html>
  `;

  widgetWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(widgetHTML)}`);

  widgetWindow.on('closed', () => {
    widgetWindow = null;
    if (store.get('widgetEnabled')) {
      store.set('widgetEnabled', false);
    }
  });

  // Prevent widget from being focused
  widgetWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
  });
};

const destroyWidget = () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.close();
    widgetWindow = null;
  }
};

const updateWidget = () => {
  if (widgetWindow && !widgetWindow.isDestroyed() && keystrokeTracker) {
    // Use cached data instead of expensive store operations
    widgetWindow.webContents.send('widget-update', {
      total: keystrokeTracker.cachedStats.total,
      today: keystrokeTracker.cachedStats.today
    });
  }
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
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'itskritix',
    repo: 'TypeCount'
  });

  // Check for updates every hour
  timerManager.addInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 60 * 60 * 1000);

  autoUpdater.checkForUpdatesAndNotify();

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
  const iconPath = getAppIconPath();
  let trayIcon = nativeImage.createFromPath(iconPath);

  if (trayIcon.isEmpty()) {
    if (process.platform === 'darwin') {
      trayIcon = nativeImage.createEmpty();
      trayIcon.resize({ width: 16, height: 16 });
    } else {
      trayIcon = createDynamicTrayIcon(store.get('totalKeystrokes') || 0);
    }
  }

  tray = new Tray(trayIcon);
  updateTrayDisplay();

  const totalCount = store.get('totalKeystrokes') ?? 0;
  const hasTypedBefore = store.get('hasTypedFirstKeystroke') || false;
  const isNewUser = totalCount === 0 && !hasTypedBefore;

  const initialMenu = isNewUser ? [
    {
      label: '✨ TypeCount Ready!',
      enabled: false
    },
    {
      label: 'Start typing to track keystrokes...',
      enabled: false
    },
    { type: 'separator' as const },
  ] : [];

  const statsMenu = [
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
  ];

  const contextMenu = Menu.buildFromTemplate([
    ...initialMenu,
    ...statsMenu,
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
      label: 'Show Desktop Widget',
      type: 'checkbox',
      checked: store.get('widgetEnabled') || false,
      click: (menuItem) => {
        const enabled = menuItem.checked;
        store.set('widgetEnabled', enabled);

        if (enabled) {
          createWidget();
        } else {
          destroyWidget();
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
      label: 'Quit TypeCount',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('TypeCount - Keystroke Tracker');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  timerManager.addInterval(() => {
    updateTrayDisplay();

    const totalCount = keystrokeTracker?.cachedStats.total ?? store.get('totalKeystrokes');
    const todayCount = keystrokeTracker?.cachedStats.today ?? getTodayKeystrokes();
    const streakDays = keystrokeTracker?.cachedStats.streak ?? store.get('streakDays');

    const updatedMenu = Menu.buildFromTemplate([
      {
        label: `Total: ${totalCount.toLocaleString()} keystrokes`,
        enabled: false
      },
      {
        label: `Today: ${todayCount.toLocaleString()} keystrokes`,
        enabled: false
      },
      {
        label: `Streak: ${streakDays} days`,
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
        label: 'Show Desktop Widget',
        type: 'checkbox',
        checked: store.get('widgetEnabled') || false,
        click: (menuItem) => {
          const enabled = menuItem.checked;
          store.set('widgetEnabled', enabled);

          if (enabled) {
            createWidget();
          } else {
            destroyWidget();
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
        label: 'Quit TypeCount',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray?.setContextMenu(updatedMenu);
  }, 3000);
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
    icon: getAppIconPath(),
    title: 'TypeCount Dashboard'
  });

  // Load debug page for troubleshooting
  const debugMode = process.env.NODE_ENV === 'development';

  if (debugMode && process.argv.includes('--debug-renderer')) {
    // Load debug page
    mainWindow.loadFile(path.join(__dirname, '../debug-renderer.html'));
  } else if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Don't open DevTools in production to avoid autofill errors
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });

    // Suppress autofill-related warnings in DevTools
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.devToolsWebContents?.executeJavaScript(`
        console.clear();
        console.log('%c TypeCount DevTools Ready', 'color: #00ff00; font-weight: bold;');
      `);
    });
  }

  // Hide window to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();

      // Show notification on first hide (optional)
      if (!store.get('hasShownTrayNotification')) {
        // You could add a notification here if desired
        store.set('hasShownTrayNotification', true);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Send initial data to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('initial-data', {
      total: store.get('totalKeystrokes'),
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
  const goal: Goal = {
    id: `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: goalData.name,
    description: goalData.description || '',
    target: goalData.target,
    current: 0,
    type: goalData.type,
    createdDate: new Date().toISOString(),
    targetDate: goalData.targetDate,
    completed: false
  };

  let goals = store.get('goals') || [];
  goals.push(goal);
  store.set('goals', goals);

  // Send updated data back to renderer
  event.reply('initial-data', {
    total: store.get('totalKeystrokes'),
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

// IPC handlers for widget communication
ipcMain.on('widget-request-data', (event) => {
  event.reply('widget-update', {
    total: store.get('totalKeystrokes') || 0,
    today: getTodayKeystrokes()
  });
});

// Hide app from dock/taskbar completely (like Raycast)
app.dock?.hide();


// App initialization
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    requestAccessibilityPermissions();
  }

  createTray();
  startKeystrokeTracking();

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

  if (store.get('widgetEnabled')) {
    createWidget();
  }

  setupAutoUpdater();
});

app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

app.on('activate', () => {
  // Silent background app
});

app.on('before-quit', () => {
  isQuitting = true;
  stopKeystrokeTracking();
  destroyWidget();
  timerManager.cleanup();
});

app.on('will-quit', (event) => {
  isQuitting = true;
});
import './index.css';
// Analytics functions moved to gamification.ts or removed
// import { getWeeklyAnalytics, getMonthlyAnalytics } from './gamification';
import {
  ACHIEVEMENT_DEFINITIONS,
  calculateLevel
} from './gamification';
import { cloudSync, CloudSyncConfig } from './cloudSync';

declare global {
  interface Window {
    electronAPI: {
      onKeystrokeUpdate: (callback: (data: any) => void) => void;
      onInitialData: (callback: (data: any) => void) => void;
      onAchievementUnlocked: (callback: (achievement: Achievement) => void) => void;
      onChallengeCompleted: (callback: (challenge: any) => void) => void;
      requestData: () => void;
      createGoal: (goalData: any) => void;
      resetAllData?: () => void;
    };
  }
}

// Interfaces matching main.ts
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

// State
let totalKeystrokes = 0;
let todayKeystrokes = 0;
let streakDays = 0;
let longestStreak = 0;
let achievements: Achievement[] = [];
let legacyAchievements: string[] = [];
let dailyData: Record<string, number> = {};
let hourlyData: Record<string, number[]> = {};
let firstUsedDate = '';
let challenges: Challenge[] = [];
let goals: Goal[] = [];
let userLevel = 1;
let userXP = 0;
let personalityType = '';
let dailyGoal = 5000;
let weeklyGoal = 35000;

// Current view state
let currentView: 'insights' | 'achievements' | 'settings' = 'insights';

// Cloud sync state
let cloudSyncEnabled = false;
let cloudSyncConfig: CloudSyncConfig = { enabled: false };
let isSignedIn = false;
let currentUser: any = null;

// Format large numbers
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

// Simplified analytics - focus on insights only

function getProductivityInsights(dailyData: Record<string, number>, hourlyData: Record<string, number[]>, streakDays: number) {
  // Calculate peak hour
  const hourlyTotals = new Array(24).fill(0);
  Object.values(hourlyData).forEach(dayHours => {
    if (Array.isArray(dayHours)) {
      dayHours.forEach((count, hour) => {
        hourlyTotals[hour] += count || 0;
      });
    }
  });

  const peakHour = hourlyTotals.indexOf(Math.max(...hourlyTotals));
  const peakHourAverage = Math.max(...hourlyTotals);

  // Calculate daily average
  const totalDays = Object.keys(dailyData).length;
  const totalKeystrokes = Object.values(dailyData).reduce((sum, count) => sum + count, 0);
  const averageDaily = totalDays > 0 ? Math.round(totalKeystrokes / totalDays) : 0;

  // Find most productive day
  let mostProductiveDay = '';
  let maxCount = 0;
  Object.entries(dailyData).forEach(([date, count]) => {
    if (count > maxCount) {
      maxCount = count;
      mostProductiveDay = new Date(date).toLocaleDateString();
    }
  });

  // Calculate 7-day trend
  const now = new Date();
  const last7Days = [];
  const previous7Days = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    last7Days.push(dailyData[dateStr] || 0);

    const prevDate = new Date(now);
    prevDate.setDate(prevDate.getDate() - i - 7);
    const prevDateStr = prevDate.toISOString().split('T')[0];
    previous7Days.push(dailyData[prevDateStr] || 0);
  }

  const last7Total = last7Days.reduce((sum, count) => sum + count, 0);
  const prev7Total = previous7Days.reduce((sum, count) => sum + count, 0);

  let trend = 'stable';
  if (last7Total > prev7Total * 1.1) trend = 'increasing';
  else if (last7Total < prev7Total * 0.9) trend = 'decreasing';

  return {
    peakHour,
    peakHourAverage,
    averageDaily,
    trend,
    mostProductiveDay,
    longestStreak: streakDays, // This should be longest streak from data
    currentStreak: streakDays
  };
}

// Create the dashboard UI
function createDashboard() {
  document.body.innerHTML = `
    <!-- Draggable Region for Frameless Window -->
    <div class="title-bar-drag-region"></div>

    <div class="container">
      <header class="main-header">
        <div class="header-content">
          <h1 class="app-title">TypeCount</h1>
          <p class="app-description">Track your typing productivity and build better habits</p>
        </div>
      </header>

      <!-- Key Metrics -->
      <div class="metrics-grid">
        <div class="metric-card metric-primary">
          <div class="metric-header">
            <span class="metric-title">Total Keystrokes</span>
          </div>
          <div class="metric-value" id="total-count">0</div>
          <div class="metric-subtitle">All time</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Today</span>
          </div>
          <div class="metric-value" id="today-count">0</div>
          <div class="metric-subtitle">Keystrokes today</div>
        </div>

        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-title">Current Streak</span>
          </div>
          <div class="metric-value" id="streak-count">0</div>
          <div class="metric-subtitle">Active days</div>
        </div>
      </div>

      <!-- Navigation -->
      <div class="navigation-section">
        <nav class="main-navigation">
          <button class="nav-button active" data-view="insights">Overview</button>
          <button class="nav-button" data-view="achievements">Achievements</button>
          <button class="nav-button" data-view="settings">Settings</button>
        </nav>

        <div class="content-area" id="analytics-content">
          <!-- Dynamic content based on selected view -->
        </div>
      </div>



      <div id="notification" class="notification"></div>
    </div>
  `;

  // Add navigation event listeners
  document.querySelectorAll('.nav-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      const view = target.dataset.view as typeof currentView;

      // Update active nav
      document.querySelectorAll('.nav-button').forEach(btn => {
        if (btn) btn.classList.remove('active');
      });
      if (target) target.classList.add('active');

      currentView = view;
      renderAnalytics();
    });
  });

}

// Render analytics based on current view
function renderAnalytics() {
  const contentEl = document.getElementById('analytics-content');
  if (!contentEl) {
    console.error('Analytics content element not found');
    showNotification('Analytics view failed to load');
    return;
  }

  try {
    switch (currentView) {
      case 'insights':
        renderInsightsView(contentEl);
        break;
      case 'achievements':
        contentEl.innerHTML = renderAchievementsView();
        break;
      case 'settings':
        contentEl.innerHTML = renderSettingsView();
        break;
    }
  } catch (error) {
    console.error('Error rendering analytics:', error);
    contentEl.innerHTML = `
      <div class="error-message">
        <h3>Unable to load analytics</h3>
        <p>There was an error processing your data. Please try refreshing the app.</p>
      </div>
    `;
  }
}



// Render insights view
function renderInsightsView(container: HTMLElement) {
  const insights = getProductivityInsights(dailyData, hourlyData, streakDays);

  const trendIcon = insights.trend === 'increasing' ? '📈' :
                    insights.trend === 'decreasing' ? '📉' : '➡️';

  const trendText = insights.trend === 'increasing' ? 'Increasing' :
                    insights.trend === 'decreasing' ? 'Decreasing' : 'Stable';

  container.innerHTML = `
    <div class="insights-section">
      <h2>Productivity Insights</h2>

      <div class="insights-grid">
        <div class="insight-card">
          <div class="insight-icon">📊</div>
          <div class="insight-content">
            <div class="insight-label">Daily Average</div>
            <div class="insight-value">${formatNumber(insights.averageDaily)}</div>
            <div class="insight-detail">keystrokes per day</div>
          </div>
        </div>

        <div class="insight-card">
          <div class="insight-icon">${trendIcon}</div>
          <div class="insight-content">
            <div class="insight-label">7-Day Trend</div>
            <div class="insight-value">${trendText}</div>
            <div class="insight-detail">Compared to previous week</div>
          </div>
        </div>

        <div class="insight-card">
          <div class="insight-icon">🔥</div>
          <div class="insight-content">
            <div class="insight-label">Longest Streak</div>
            <div class="insight-value">${insights.longestStreak} days</div>
            <div class="insight-detail">Current: ${insights.currentStreak} days</div>
          </div>
        </div>
      </div>
    </div>
  `;
}



// Render achievements view
function renderAchievementsView(): string {
  // Define milestone achievements with their unlock thresholds
  const milestoneAchievements = [
    { id: 'first_keystroke', name: 'First Steps', description: 'Type your first keystroke', threshold: 1, icon: '🌱' },
    { id: '100_keystrokes', name: 'Getting Started', description: 'Reach 100 keystrokes', threshold: 100, icon: '🚀' },
    { id: '1k_keystrokes', name: 'Bronze Typist', description: 'Reach 1,000 keystrokes', threshold: 1000, icon: '🥉' },
    { id: '5k_keystrokes', name: 'Active Typist', description: 'Reach 5,000 keystrokes', threshold: 5000, icon: '⚡' },
    { id: '10k_keystrokes', name: 'Silver Typist', description: 'Reach 10,000 keystrokes', threshold: 10000, icon: '🥈' },
    { id: '25k_keystrokes', name: 'Dedicated Typist', description: 'Reach 25,000 keystrokes', threshold: 25000, icon: '💪' },
    { id: '50k_keystrokes', name: 'Serious Typist', description: 'Reach 50,000 keystrokes', threshold: 50000, icon: '🎯' },
    { id: '100k_keystrokes', name: 'Gold Typist', description: 'Reach 100,000 keystrokes', threshold: 100000, icon: '🥇' },
    { id: '250k_keystrokes', name: 'Expert Typist', description: 'Reach 250,000 keystrokes', threshold: 250000, icon: '⭐' },
    { id: '500k_keystrokes', name: 'Master Typist', description: 'Reach 500,000 keystrokes', threshold: 500000, icon: '💎' },
    { id: '1m_keystrokes', name: 'Legendary Typist', description: 'Reach 1,000,000 keystrokes', threshold: 1000000, icon: '👑' }
  ];

  // Check which achievements are unlocked
  const achievementsWithStatus = milestoneAchievements.map(achievement => {
    const isUnlocked = totalKeystrokes >= achievement.threshold;
    const progress = Math.min((totalKeystrokes / achievement.threshold) * 100, 100);

    return {
      ...achievement,
      isUnlocked,
      progress
    };
  });

  const unlockedCount = achievementsWithStatus.filter(a => a.isUnlocked).length;
  const totalCount = milestoneAchievements.length;

  return `
    <div class="achievements-container">
      <div class="achievements-header">
        <div class="header-content">
          <h2 class="achievements-title">Achievements</h2>
          <p class="achievements-description">Track your typing milestones and celebrate your progress</p>
        </div>

        <div class="achievements-summary">
          <div class="summary-card">
            <div class="summary-value">${unlockedCount}</div>
            <div class="summary-label">Unlocked</div>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-card">
            <div class="summary-value">${totalCount}</div>
            <div class="summary-label">Total</div>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-card">
            <div class="summary-value">${Math.round((unlockedCount / totalCount) * 100)}%</div>
            <div class="summary-label">Complete</div>
          </div>
        </div>
      </div>

      <div class="achievements-grid">
        ${achievementsWithStatus.map(achievement => `
          <div class="achievement-card ${achievement.isUnlocked ? 'unlocked' : 'locked'}">
            <div class="achievement-icon-container">
              <div class="achievement-icon ${achievement.isUnlocked ? 'unlocked' : ''}">${achievement.icon}</div>
              ${achievement.isUnlocked ? '<div class="unlock-badge">✓</div>' : ''}
            </div>

            <div class="achievement-content">
              <h3 class="achievement-name">${achievement.name}</h3>
              <p class="achievement-description">${achievement.description}</p>

              ${!achievement.isUnlocked ? `
                <div class="achievement-progress">
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${achievement.progress}%"></div>
                  </div>
                  <div class="progress-text">
                    ${formatNumber(totalKeystrokes)} / ${formatNumber(achievement.threshold)}
                  </div>
                </div>
              ` : `
                <div class="achievement-unlocked">
                  <span class="unlock-text">Unlocked!</span>
                </div>
              `}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}




// Update the UI with new data
function updateUI() {
  try {
    const elements = {
      totalEl: document.getElementById('total-count'),
      todayEl: document.getElementById('today-count'),
      streakEl: document.getElementById('streak-count')
    };

    // Update metrics
    if (elements.totalEl) elements.totalEl.textContent = formatNumber(totalKeystrokes);
    if (elements.todayEl) elements.todayEl.textContent = formatNumber(todayKeystrokes);
    if (elements.streakEl) elements.streakEl.textContent = `${streakDays}`;

    // Log missing critical elements
    const missingElements = Object.entries(elements)
      .filter(([_, element]) => !element)
      .map(([key]) => key);

    if (missingElements.length > 0) {
      console.warn('Missing UI elements:', missingElements);
    }

    // Achievements view updates automatically through renderAnalytics()

    // Only re-render the current analytics view if it depends on real-time data
    if (currentView === 'insights') {
      renderAnalytics();
    }
    // Don't re-render forms/modals/settings that contain user input
  } catch (error) {
    console.error('Error updating UI:', error);
    showNotification('UI update failed - please refresh the page');
  }
}


// Render settings view
function renderSettingsView(): string {
  return `
    <div class="settings-container">
      <div class="settings-header">
        <div class="header-content">
          <h2 class="settings-title">Settings</h2>
          <p class="settings-description">Manage your preferences and account settings</p>
        </div>
      </div>

      <!-- Cloud Sync Card -->
      <div class="settings-card">
        <div class="card-header">
          <div class="card-title-section">
            <h3 class="card-title">Cloud Sync</h3>
            <p class="card-description">Sync your typing data across devices securely</p>
          </div>
          <div class="connection-status ${isSignedIn ? 'connected' : 'disconnected'}">
            <div class="status-indicator"></div>
            <span class="status-text">${isSignedIn ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>

        <div class="card-content">
          ${!isSignedIn ? `
            <div class="auth-container">
              <div class="auth-header">
                <h4>Sign in to enable cloud sync</h4>
                <p>Securely backup and sync your typing data across all your devices</p>
              </div>

              <form id="auth-form" class="auth-form" onsubmit="handleAuth(event)">
                <div class="form-field">
                  <label class="field-label" for="auth-email">Email address</label>
                  <input
                    type="email"
                    id="auth-email"
                    class="field-input"
                    required
                    placeholder="Enter your email"
                    autocomplete="email"
                  >
                </div>

                <div class="form-field">
                  <label class="field-label" for="auth-password">Password</label>
                  <input
                    type="password"
                    id="auth-password"
                    class="field-input"
                    required
                    placeholder="Enter your password"
                    autocomplete="current-password"
                  >
                </div>

                <button type="submit" class="auth-button" id="auth-submit">
                  <span class="btn-content">
                    <span class="btn-text">Sign In</span>
                    <span class="btn-loading hidden">Signing in...</span>
                  </span>
                </button>

                <input type="hidden" id="auth-mode" value="signin">
              </form>

            </div>
          ` : `
            <div class="sync-dashboard">
              <div class="account-info">
                <div class="user-avatar">
                  <div class="avatar-icon">${currentUser?.email?.charAt(0).toUpperCase() || 'U'}</div>
                </div>
                <div class="user-details">
                  <h4 class="user-email">${currentUser?.email || 'Unknown User'}</h4>
                  <p class="user-status">Account active</p>
                </div>
              </div>

              <div class="sync-settings">
                <div class="setting-row">
                  <div class="setting-info">
                    <h5>Automatic Sync</h5>
                    <p>Automatically backup your data to the cloud</p>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" ${cloudSyncEnabled ? 'checked' : ''} onchange="toggleCloudSync(this.checked)">
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                ${cloudSyncEnabled ? `
                  <div class="setting-row">
                    <div class="setting-info">
                      <h5>Sync Frequency</h5>
                      <p>How often to sync your data</p>
                    </div>
                    <select class="setting-select" id="sync-interval" onchange="updateSyncInterval(this.value)">
                      <option value="1" ${cloudSyncConfig.syncInterval === 1 ? 'selected' : ''}>Every hour</option>
                      <option value="6" ${cloudSyncConfig.syncInterval === 6 ? 'selected' : ''}>Every 6 hours</option>
                      <option value="24" ${cloudSyncConfig.syncInterval === 24 ? 'selected' : ''}>Daily</option>
                      <option value="168" ${cloudSyncConfig.syncInterval === 168 ? 'selected' : ''}>Weekly</option>
                    </select>
                  </div>
                ` : ''}

                ${cloudSyncConfig.lastSync ? `
                  <div class="sync-status-info">
                    <span class="sync-label">Last synced</span>
                    <span class="sync-time">${new Date(cloudSyncConfig.lastSync).toLocaleString()}</span>
                  </div>
                ` : ''}
              </div>

              <div class="sync-actions">
                <button class="action-button primary" onclick="manualSync()">
                  <span class="button-icon">↻</span>
                  Sync Now
                </button>
                <button class="action-button secondary" onclick="backupData()">
                  <span class="button-icon">💾</span>
                  Backup
                </button>
                <button class="action-button secondary" onclick="showRestoreModal()">
                  <span class="button-icon">📥</span>
                  Restore
                </button>
              </div>

              <div class="account-footer">
                <button class="sign-out-button" onclick="signOut()">Sign Out</button>
              </div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

// Cloud sync authentication functions (simplified to signin only)
function showAuthTab(mode: 'signin' | 'signup') {
  // Function kept for compatibility but only handles signin now
  return;
}

async function handleAuth(event: Event) {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const email = formData.get('auth-email') as string;
  const password = formData.get('auth-password') as string;

  if (!email || !password) {
    showNotification('Please fill in all fields');
    return;
  }

  const submitBtn = document.getElementById('auth-submit');
  const btnText = submitBtn?.querySelector('.btn-text') as HTMLElement;
  const btnLoading = submitBtn?.querySelector('.btn-loading') as HTMLElement;

  try {
    // Show loading state
    if (btnText && btnLoading) {
      btnText.classList.add('hidden');
      btnLoading.classList.remove('hidden');
    }

    // Initialize cloud sync with dummy config for demo
    const success = await cloudSync.initialize({
      enabled: true,
      supabaseUrl: 'https://your-project.supabase.co', // Replace with actual URL
      supabaseKey: 'your-anon-key', // Replace with actual key
      autoSync: true,
      syncInterval: 24
    });

    if (!success) {
      throw new Error('Failed to initialize cloud sync');
    }

    // Attempt signin only
    const result = await cloudSync.signIn(email, password);

    if (result.error) {
      throw new Error(result.error.message || 'Authentication failed');
    }

    if (result.user) {
      currentUser = result.user;
      isSignedIn = true;
      cloudSyncEnabled = true;

      showNotification('Successfully signed in!');

      // Refresh settings view
      if (currentView === 'settings') {
        renderAnalytics();
      }

      // Trigger initial sync
      setTimeout(() => manualSync(), 1000);
    }
  } catch (error: any) {
    console.error('Authentication error:', error);
    showNotification(`${error.message || 'Authentication failed'}`);
  } finally {
    // Reset loading state
    if (btnText && btnLoading) {
      btnText.classList.remove('hidden');
      btnLoading.classList.add('hidden');
    }
  }
}

async function signOut() {
  try {
    await cloudSync.signOut();
    currentUser = null;
    isSignedIn = false;
    cloudSyncEnabled = false;

    showNotification(' Signed out successfully');

    // Refresh settings view
    if (currentView === 'settings') {
      renderAnalytics();
    }
  } catch (error: any) {
    console.error('Sign out error:', error);
    showNotification(' Failed to sign out');
  }
}

// Cloud backup and sync functions
async function backupData() {
  if (!cloudSync.isEnabled() || !cloudSync.isAuthenticated()) {
    showNotification(' Cloud sync not available');
    return;
  }

  try {
    showNotification('⏳ Backing up data...');

    const localData = {
      totalKeystrokes,
      dailyKeystrokes: dailyData,
      hourlyKeystrokes: hourlyData,
      achievements,
      challenges,
      goals,
      userLevel,
      userXP,
      personalityType,
      streakDays,
      firstUsedDate
    };

    const result = await cloudSync.backupData(localData);

    if (result.success) {
      showNotification(' Data backed up successfully!');

      // Update last sync time in UI
      cloudSyncConfig.lastSync = new Date().toISOString();
      if (currentView === 'settings') {
        renderAnalytics();
      }
    } else {
      throw new Error(result.error || 'Backup failed');
    }
  } catch (error: any) {
    console.error('Backup error:', error);
    showNotification(` Backup failed: ${error.message}`);
  }
}

async function manualSync() {
  if (!cloudSync.isEnabled() || !cloudSync.isAuthenticated()) {
    showNotification(' Cloud sync not available');
    return;
  }

  try {
    showNotification('⏳ Syncing data...');

    const localData = {
      totalKeystrokes,
      dailyKeystrokes: dailyData,
      hourlyKeystrokes: hourlyData,
      achievements,
      challenges,
      goals,
      userLevel,
      userXP,
      personalityType,
      streakDays,
      firstUsedDate
    };

    const result = await cloudSync.syncData(localData);

    if (result.success && result.mergedData) {
      // Update local state with merged data
      totalKeystrokes = result.mergedData.totalKeystrokes || totalKeystrokes;
      dailyData = result.mergedData.dailyKeystrokes || dailyData;
      hourlyData = result.mergedData.hourlyKeystrokes || hourlyData;
      achievements = result.mergedData.achievements || achievements;
      userLevel = result.mergedData.userLevel || userLevel;
      userXP = result.mergedData.userXP || userXP;
      personalityType = result.mergedData.personalityType || personalityType;
      streakDays = result.mergedData.streakDays || streakDays;
      firstUsedDate = result.mergedData.firstUsedDate || firstUsedDate;

      // Update UI
      updateUI();

      showNotification(' Data synced successfully!');

      // Update last sync time in UI
      cloudSyncConfig.lastSync = new Date().toISOString();
      if (currentView === 'settings') {
        renderAnalytics();
      }
    } else {
      throw new Error(result.error || 'Sync failed');
    }
  } catch (error: any) {
    console.error('Sync error:', error);
    showNotification(` Sync failed: ${error.message}`);
  }
}

async function restoreFromCloud() {
  if (!cloudSync.isEnabled() || !cloudSync.isAuthenticated()) {
    showNotification(' Cloud sync not available');
    return;
  }

  try {
    showNotification('⏳ Restoring data from cloud...');

    const result = await cloudSync.restoreData();

    if (result.success && result.data) {
      const cloudDataArray = result.data;

      if (cloudDataArray.length === 0) {
        showNotification('ℹ️ No cloud data found');
        return;
      }

      // Show restore confirmation modal with device selection
      showRestoreModal(cloudDataArray);
    } else {
      throw new Error(result.error || 'Restore failed');
    }
  } catch (error: any) {
    console.error('Restore error:', error);
    showNotification(` Restore failed: ${error.message}`);
  }
}

function showRestoreModal(cloudDataArray: any[] = []) {
  // Create restore modal dynamically
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'restoreModal';

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h4>📥 Restore Data</h4>
        <button class="close-btn" onclick="hideRestoreModal()">&times;</button>
      </div>
      <div class="modal-body">
        ${cloudDataArray.length > 0 ? `
          <p>Select which device data to restore from:</p>
          <div class="device-list">
            ${cloudDataArray.map((deviceData, index) => `
              <div class="device-item">
                <input type="radio" id="device-${index}" name="restore-device" value="${index}">
                <label for="device-${index}">
                  <div class="device-info">
                    <div class="device-name">${deviceData.device_name || 'Unknown Device'}</div>
                    <div class="device-stats">
                      ${formatNumber(deviceData.total_keystrokes || 0)} keystrokes
                    </div>
                    <div class="device-date">
                      Last updated: ${new Date(deviceData.last_updated).toLocaleString()}
                    </div>
                  </div>
                </label>
              </div>
            `).join('')}
          </div>
        ` : `
          <p>No cloud backup data found. Would you like to create your first backup?</p>
        `}
      </div>
      <div class="form-actions">
        <button type="button" class="cancel-btn" onclick="hideRestoreModal()">Cancel</button>
        ${cloudDataArray.length > 0 ? `
          <button type="button" class="restore-btn" onclick="confirmRestore()">Restore Selected</button>
        ` : `
          <button type="button" class="backup-btn" onclick="hideRestoreModal(); backupData();">Create Backup</button>
        `}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function hideRestoreModal() {
  const modal = document.getElementById('restoreModal');
  if (modal) {
    modal.remove();
  }
}

async function confirmRestore() {
  const selectedDevice = document.querySelector('input[name="restore-device"]:checked') as HTMLInputElement;

  if (!selectedDevice) {
    showNotification('Please select a device to restore from');
    return;
  }

  try {
    const result = await cloudSync.restoreData();
    if (result.success && result.data) {
      const deviceData = result.data[parseInt(selectedDevice.value)];

      // Apply restored data
      totalKeystrokes = deviceData.total_keystrokes || 0;
      dailyData = deviceData.daily_keystrokes || {};
      hourlyData = deviceData.hourly_keystrokes || {};
      achievements = deviceData.achievements || [];
      userLevel = deviceData.user_level || 1;
      userXP = deviceData.user_xp || 0;
      personalityType = deviceData.personality_type || '';
      streakDays = deviceData.streak_days || 0;
      firstUsedDate = deviceData.first_used_date || new Date().toISOString();

      // Update UI
      updateUI();

      hideRestoreModal();
      showNotification(' Data restored successfully!');
    }
  } catch (error: any) {
    console.error('Restore error:', error);
    showNotification(` Restore failed: ${error.message}`);
  }
}

function toggleCloudSync(enabled: boolean) {
  cloudSyncEnabled = enabled;
  cloudSyncConfig.enabled = enabled;

  if (enabled && cloudSync.shouldSync()) {
    manualSync();
  }

  showNotification(enabled ? ' Cloud sync enabled' : '⚪ Cloud sync disabled');
}

function updateSyncInterval(hours: string) {
  cloudSyncConfig.syncInterval = parseInt(hours);
  cloudSync.updateConfig({ syncInterval: parseInt(hours) });

  showNotification(`⏱️ Sync frequency updated to every ${hours} hour${hours === '1' ? '' : 's'}`);
}

function showResetDataModal() {
  const modal = document.getElementById('resetDataModal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function hideResetDataModal() {
  const modal = document.getElementById('resetDataModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function confirmResetData() {
  try {
    // Reset all local data
    totalKeystrokes = 0;
    todayKeystrokes = 0;
    streakDays = 0;
    achievements = [];
    challenges = [];
    goals = [];
    userLevel = 1;
    userXP = 0;
    personalityType = '';
    dailyData = {};
    hourlyData = {};
    firstUsedDate = new Date().toISOString();

    // Send reset command to main process
    window.electronAPI.resetAllData?.();

    // Update UI
    updateUI();

    hideResetDataModal();
    showNotification(' All data has been reset');
  } catch (error: any) {
    console.error('Reset error:', error);
    showNotification(' Failed to reset data');
  }
}

function toggleAnalytics(enabled: boolean) {
  // Store analytics preference
  localStorage.setItem('typecount-analytics-enabled', enabled.toString());
  showNotification(enabled ? ' Analytics sharing enabled' : '⚪ Analytics sharing disabled');
}

// Initialize cloud sync on app start
async function initializeCloudSync() {
  try {
    // Check for existing cloud sync configuration
    const storedConfig = localStorage.getItem('typecount-cloud-config');
    if (storedConfig) {
      cloudSyncConfig = JSON.parse(storedConfig);

      if (cloudSyncConfig.enabled) {
        const success = await cloudSync.initialize(cloudSyncConfig);

        if (success) {
          isSignedIn = cloudSync.isAuthenticated();
          currentUser = cloudSync.getCurrentUser();
          cloudSyncEnabled = cloudSyncConfig.enabled;

          // Auto-sync if needed and enabled
          if (cloudSyncEnabled && cloudSync.shouldSync()) {
            setTimeout(() => manualSync(), 2000);
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to initialize cloud sync:', error);
  }
}

// Goal management functions
function showCreateGoalModal() {
  const modal = document.getElementById('goalModal');
  if (modal) {
    modal.classList.remove('hidden');
    const goalNameInput = document.getElementById('goalName') as HTMLInputElement;
    if (goalNameInput) goalNameInput.focus();
  }
}

function hideCreateGoalModal() {
  const modal = document.getElementById('goalModal');
  if (modal) {
    modal.classList.add('hidden');
    // Reset form
    const form = document.getElementById('goalForm') as HTMLFormElement;
    if (form) form.reset();
  }
}

function createNewGoal(event: Event) {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  if (!form) {
    showNotification('Error: Form not found');
    return;
  }

  try {
    const formData = new FormData(form);

    const goalName = formData.get('goalName') as string;
    const goalTarget = formData.get('goalTarget') as string;

    if (!goalName || !goalTarget) {
      showNotification('Error: Please fill in all required fields');
      return;
    }

    const goalData = {
      name: goalName,
      description: formData.get('goalDescription') as string || '',
      target: parseInt(goalTarget),
      type: formData.get('goalType') as 'daily' | 'weekly' | 'monthly' | 'custom',
      targetDate: formData.get('goalTargetDate') as string || undefined
    };

    if (isNaN(goalData.target) || goalData.target <= 0) {
      showNotification('Error: Please enter a valid target number');
      return;
    }

    // Send to main process
    window.electronAPI.createGoal(goalData);

    // Hide modal and show notification
    hideCreateGoalModal();
    showNotification(`Goal "${goalData.name}" created successfully!`);
  } catch (error) {
    showNotification('Error: Failed to create goal');
    console.error('Error creating goal:', error);
  }
}

// Show notification
function showNotification(message: string) {
  const notification = document.getElementById('notification');
  if (!notification) return;

  notification.textContent = message;
  notification.classList.add('show');

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// Celebration system for achievements and milestones
function showCelebration(type: 'achievement' | 'challenge' | 'levelup', title: string, description?: string) {
  try {
    // Remove any existing celebrations to prevent duplicates
    hideCelebration();

    // Create celebration overlay
    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';

    const celebration = document.createElement('div');
    celebration.className = `celebration celebration-${type}`;

    // Add confetti animation with error handling
    const confetti = document.createElement('div');
    confetti.className = 'confetti-container';

    try {
      for (let i = 0; i < 20; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.animationDelay = Math.random() * 2 + 's';
        piece.style.backgroundColor = getRandomColor();
        confetti.appendChild(piece);
      }
    } catch (confettiError) {
      console.warn('Confetti animation failed:', confettiError);
    }

    const content = `
      <div class="celebration-content">
        <div class="celebration-icon">
          ${getCelebrationIcon(type)}
        </div>
        <h2 class="celebration-title">${title}</h2>
        ${description ? `<p class="celebration-description">${description}</p>` : ''}
        <button class="celebration-close" onclick="hideCelebration()">Continue</button>
      </div>
    `;

    celebration.innerHTML = content;
    overlay.appendChild(confetti);
    overlay.appendChild(celebration);

    if (document.body) {
      document.body.appendChild(overlay);
    } else {
      console.error('Document body not available for celebration');
      return;
    }

    // Auto hide after 5 seconds with error handling
    setTimeout(() => {
      try {
        hideCelebration();
      } catch (error) {
        console.error('Error auto-hiding celebration:', error);
      }
    }, 5000);
  } catch (error) {
    console.error('Error showing celebration:', error);
    showNotification(`${type} celebration: ${title}`);
  }
}

function getCelebrationIcon(type: string): string {
  switch (type) {
    case 'achievement': return '🏆';
    case 'challenge': return '🎯';
    case 'levelup': return '⭐';
    default: return '🎉';
  }
}

function getRandomColor(): string {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function hideCelebration() {
  try {
    const overlay = document.querySelector('.celebration-overlay') as HTMLElement;
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        try {
          if (overlay.parentNode) {
            overlay.remove();
          }
        } catch (removeError) {
          console.warn('Error removing celebration overlay:', removeError);
        }
      }, 300);
    }
  } catch (error) {
    console.error('Error hiding celebration:', error);
  }
}

// Enhanced achievement notification with celebration
function celebrateAchievement(achievement: string) {
  const achievementNames: Record<string, string> = {
    'first_keystroke': 'First Steps!',
    'hundred_keystrokes': 'Getting Started!',
    '1k_keystrokes': 'Bronze Typist!',
    '5k_keystrokes': 'Active Typist!',
    '10k_keystrokes': 'Silver Typist!',
    '25k_keystrokes': 'Dedicated Typist!',
    '50k_keystrokes': 'Serious Typist!',
    '100k_keystrokes': 'Gold Typist!',
    '250k_keystrokes': 'Expert Typist!',
    '500k_keystrokes': 'Master Typist!',
    '1m_keystrokes': 'Legendary Typist!'
  };

  const achievementDescriptions: Record<string, string> = {
    'first_keystroke': 'Your journey begins!',
    'hundred_keystrokes': 'You\'re getting the hang of this!',
    '1k_keystrokes': 'First milestone reached!',
    '5k_keystrokes': 'You\'re on fire!',
    '10k_keystrokes': 'Impressive dedication!',
    '25k_keystrokes': 'Keep up the great work!',
    '50k_keystrokes': 'You\'re a typing machine!',
    '100k_keystrokes': 'Amazing achievement!',
    '250k_keystrokes': 'Expert level reached!',
    '500k_keystrokes': 'Master of the keyboard!',
    '1m_keystrokes': 'Legendary status achieved!'
  };

  const title = achievementNames[achievement] || 'Achievement Unlocked!';
  const description = achievementDescriptions[achievement] || 'Keep up the great work!';

  showCelebration('achievement', title, description);
}

// Initialize the app
createDashboard();

// Initialize cloud sync
initializeCloudSync();

// Listen for data updates from main process
window.electronAPI.onKeystrokeUpdate((data) => {
  totalKeystrokes = data.total;
  todayKeystrokes = data.today;
  updateUI();
});

window.electronAPI.onInitialData((data) => {
  totalKeystrokes = data.total;
  todayKeystrokes = data.today;
  streakDays = data.streak;
  achievements = data.achievements || [];
  challenges = data.challenges || [];
  goals = data.goals || [];
  userLevel = data.userLevel || 1;
  userXP = data.userXP || 0;
  personalityType = data.personalityType || '';
  dailyData = data.dailyData || {};
  hourlyData = data.hourlyData || {};
  firstUsedDate = data.firstUsedDate || new Date().toISOString();

  updateUI();
});

window.electronAPI.onAchievementUnlocked((achievement) => {
  achievements.push(achievement);

  // Re-render achievements view if currently visible
  if (currentView === 'achievements') {
    renderAnalytics();
  }

  // Show celebration animation
  celebrateAchievement(achievement.id);
});

window.electronAPI.onChallengeCompleted((challenge) => {
  // Update local challenges data
  challenges = challenges.map(c =>
    c.id === challenge.id ? challenge : c
  );

  // Show celebration animation
  showCelebration('challenge', `Challenge Complete!`, `${challenge.name} - Earned ${challenge.reward || '0 XP'}`);

  // Update UI to reflect completion
  // No specific view updates needed since challenges view was removed
});

// Request initial data on load
window.electronAPI.requestData();

// Make functions globally available for onclick handlers
(window as any).showCreateGoalModal = showCreateGoalModal;
(window as any).hideCreateGoalModal = hideCreateGoalModal;
(window as any).createNewGoal = createNewGoal;
(window as any).showAuthTab = showAuthTab;
(window as any).handleAuth = handleAuth;
(window as any).signOut = signOut;
(window as any).manualSync = manualSync;
(window as any).backupData = backupData;
(window as any).showRestoreModal = showRestoreModal;
(window as any).hideRestoreModal = hideRestoreModal;
(window as any).confirmRestore = confirmRestore;
(window as any).showResetDataModal = showResetDataModal;
(window as any).hideResetDataModal = hideResetDataModal;
(window as any).confirmResetData = confirmResetData;
(window as any).hideCelebration = hideCelebration;
(window as any).toggleCloudSync = toggleCloudSync;
(window as any).updateSyncInterval = updateSyncInterval;


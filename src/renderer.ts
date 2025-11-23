import './index.css';
// Analytics functions moved to gamification.ts or removed
// import { getWeeklyAnalytics, getMonthlyAnalytics } from './gamification';
import {
  ACHIEVEMENT_DEFINITIONS,
  calculateLevel
} from './gamification';
import { cloudSync, CloudSyncConfig } from './cloudSync';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

declare global {
  interface Window {
    electronAPI: {
      onKeystrokeUpdate: (callback: (data: any) => void) => void;
      onInitialData: (callback: (data: any) => void) => void;
      onAchievementUnlocked: (callback: (achievement: Achievement) => void) => void;
      onChallengeCompleted: (callback: (challenge: any) => void) => void;
      onLevelUp: (callback: (data: { level: number; xp: number }) => void) => void;
      requestData: () => void;
      createGoal: (goalData: any) => void;
      updateUserData: (data: any) => void;
      resetAllData?: () => void;
    };
  }
}

// Data Interfaces
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

// Chart state
let productivityChart: Chart | null = null;
let currentChartTimeframe: 'weekly' | 'monthly' | 'yearly' = 'weekly';

// Current view state
let currentView: 'insights' | 'achievements' | 'settings' = 'insights';
let lastRenderedView: string = '';
let lastChartRender: number = 0;

// Cloud sync state
let cloudSyncEnabled = false;
let cloudSyncConfig: CloudSyncConfig = { enabled: false };
let isSignedIn = false;
let currentUser: any = null;

// Helper function to get local date in YYYY-MM-DD format (not UTC)
function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
    const dateStr = getLocalDateString(date);
    last7Days.push(dailyData[dateStr] || 0);

    const prevDate = new Date(now);
    prevDate.setDate(prevDate.getDate() - i - 7);
    const prevDateStr = getLocalDateString(prevDate);
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

// Chart Logic
function switchChartTimeframe(timeframe: 'weekly' | 'monthly' | 'yearly') {
  currentChartTimeframe = timeframe;
  renderAnalytics();
}

function getChartData(timeframe: 'weekly' | 'monthly' | 'yearly') {
  const labels: string[] = [];
  const data: number[] = [];
  const now = new Date();

  if (timeframe === 'weekly') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
      data.push(dailyData[dateStr] || 0);
    }
  } else if (timeframe === 'monthly') {
     for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = getLocalDateString(d);
      labels.push(d.getDate().toString());
      data.push(dailyData[dateStr] || 0);
    }
  } else if (timeframe === 'yearly') {
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = d.toLocaleDateString(undefined, { month: 'short' });
        labels.push(monthName);
        
        let monthTotal = 0;
        const year = d.getFullYear();
        const month = d.getMonth();
        
        Object.entries(dailyData).forEach(([dateStr, count]) => {
            const [entryYear, entryMonth] = dateStr.split('-').map(Number);
            if (entryYear === year && entryMonth - 1 === month) {
                monthTotal += count;
            }
        });
        data.push(monthTotal);
    }
  }

  return { labels, data };
}

function renderProductivityChart() {
  const ctx = document.getElementById('productivityChart') as HTMLCanvasElement;
  if (!ctx) return;

  if (productivityChart) {
    productivityChart.destroy();
  }

  const { labels, data } = getChartData(currentChartTimeframe);

  // Determine grid color based on theme
  const gridColor = 'rgba(255, 255, 255, 0.05)';
  const textColor = '#71717a';

  productivityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Keystrokes',
        data,
        borderColor: '#06b6d4', // Cyan
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
          gradient.addColorStop(0, 'rgba(6, 182, 212, 0.5)');
          gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');
          return gradient;
        },
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#09090b',
        pointBorderColor: '#8b5cf6', // Violet
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(9, 9, 11, 0.95)',
          titleColor: '#fafafa',
          bodyColor: '#a1a1aa',
          borderColor: 'rgba(139, 92, 246, 0.3)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => `Keystrokes: ${context.parsed.y.toLocaleString()}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { 
            color: textColor,
            callback: (value) => {
              if (typeof value === 'number') {
                return value >= 1000 ? `${(value/1000).toFixed(1)}k` : value;
              }
              return value;
            }
          },
          border: { display: false }
        },
        x: {
          grid: { display: false },
          ticks: { color: textColor },
          border: { display: false }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      animation: {
        duration: 750,
        easing: 'easeOutQuart'
      }
    }
  });
}

// Create the dashboard UI
function createDashboard() {
  document.body.innerHTML = `
    <!-- Draggable Region for Frameless Window -->
    <div class="title-bar-drag-region"></div>

    <div class="container">
      <header class="main-header" style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div class="header-content" style="margin-bottom: 0;">
          <h1 class="app-title">TypeCount</h1>
          <p class="app-description">Track your typing productivity and build better habits</p>
        </div>
        
        <!-- Gamification Header -->
        <div class="user-level-container" style="text-align: right; min-width: 250px;">
          <div class="level-info" style="margin-bottom: 0.5rem;">
            <span class="level-badge" style="background: var(--accent-primary); color: white; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem;">LVL <span id="user-level">1</span></span>
            <span class="xp-text" style="font-size: 0.9rem; color: var(--text-secondary); margin-left: 8px;"><span id="user-xp">0</span> XP</span>
          </div>
          <div class="xp-progress-bar" style="width: 100%; height: 6px; background: var(--bg-surface-hover); border-radius: 3px; overflow: hidden; position: relative;">
            <div id="xp-fill" style="height: 100%; width: 0%; background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary)); transition: width 0.5s ease;"></div>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Next Level: <span id="next-level-xp">1000</span> XP</div>
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

      <!-- Chart Section -->
      <div class="chart-section cyber-card" style="margin-top: 2rem; padding: 1.5rem; border: 1px solid var(--border-subtle); border-radius: 12px; background: rgba(9, 9, 11, 0.4);">
        <div class="chart-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-primary);">Typing Consistency</h3>
          <div class="chart-controls" style="display: flex; gap: 0.5rem; background: var(--bg-surface); padding: 4px; border-radius: 8px;">
            <button class="cyber-button small ${currentChartTimeframe === 'weekly' ? 'active' : ''}" onclick="switchChartTimeframe('weekly')" style="font-size: 0.8rem; padding: 4px 12px; min-width: 60px;">Week</button>
            <button class="cyber-button small ${currentChartTimeframe === 'monthly' ? 'active' : ''}" onclick="switchChartTimeframe('monthly')" style="font-size: 0.8rem; padding: 4px 12px; min-width: 60px;">Month</button>
            <button class="cyber-button small ${currentChartTimeframe === 'yearly' ? 'active' : ''}" onclick="switchChartTimeframe('yearly')" style="font-size: 0.8rem; padding: 4px 12px; min-width: 60px;">Year</button>
          </div>
        </div>
        <div style="position: relative; height: 300px; width: 100%;">
          <canvas id="productivityChart"></canvas>
        </div>
      </div>
    </div>
  `;

  // Render chart after DOM update
  setTimeout(() => renderProductivityChart(), 0);
}



// Render achievements view with "Cyber Glass" effect
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

  // Initialize mouse tracking after render (using a small timeout to ensure DOM exists)
  setTimeout(() => {
    const cards = document.querySelectorAll('.achievement-card');
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e: any) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
        
        (card as HTMLElement).style.setProperty('--pointer-x', x.toFixed(2));
        (card as HTMLElement).style.setProperty('--pointer-y', y.toFixed(2));
        (card as HTMLElement).style.setProperty('--card-opacity', '1');
      });

      card.addEventListener('mouseleave', () => {
        (card as HTMLElement).style.setProperty('--card-opacity', '0.15');
      });
    });
  }, 100);

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
            <!-- Dynamic Glow Layer -->
            <div class="card-glow-layer"></div>
            
            <!-- Blurred Background Icon -->
            <div class="bg-icon">${achievement.icon}</div>

            <!-- Main Content -->
            <div class="card-content">
              <div class="achievement-icon">${achievement.icon}</div>
              <h3 class="achievement-name">${achievement.name}</h3>
              <p class="achievement-description">${achievement.description}</p>
              
              ${achievement.isUnlocked 
                ? `<div class="status-badge unlocked">Unlocked</div>` 
                : `
                  <div class="card-progress">
                    <div class="card-progress-fill" style="width: ${achievement.progress}%"></div>
                  </div>
                  <div class="progress-text" style="margin-top: 8px; font-size: 10px; opacity: 0.7;">
                    ${formatNumber(totalKeystrokes)} / ${formatNumber(achievement.threshold)}
                  </div>
                  `
              }
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
      streakEl: document.getElementById('streak-count'),
      levelEl: document.getElementById('user-level'),
      xpEl: document.getElementById('user-xp'),
      xpFillEl: document.getElementById('xp-fill'),
      nextLevelEl: document.getElementById('next-level-xp')
    };

    // Update metrics
    if (elements.totalEl) elements.totalEl.textContent = formatNumber(totalKeystrokes);
    if (elements.todayEl) elements.todayEl.textContent = formatNumber(todayKeystrokes);
    if (elements.streakEl) elements.streakEl.textContent = `${streakDays}`;

    // Update Level & XP
    if (elements.levelEl) elements.levelEl.textContent = `${userLevel}`;
    if (elements.xpEl) elements.xpEl.textContent = formatNumber(userXP);
    
    // Calculate XP Progress (simplified logic to match UI needs)
    // Next level XP = (level)^2 * 1000
    const nextLevelXP = Math.pow(userLevel, 2) * 1000;
    const prevLevelXP = Math.pow(userLevel - 1, 2) * 1000;
    const levelProgress = userXP - prevLevelXP;
    const levelTotal = nextLevelXP - prevLevelXP;
    const progressPercent = Math.min(Math.max((levelProgress / levelTotal) * 100, 0), 100);

    if (elements.xpFillEl) elements.xpFillEl.style.width = `${progressPercent}%`;
    if (elements.nextLevelEl) elements.nextLevelEl.textContent = formatNumber(nextLevelXP);

    // Log missing critical elements
    const missingElements = Object.entries(elements)
      .filter(([key, element]) => !element && ['totalEl', 'todayEl'].includes(key)) // Only warn for critical
      .map(([key]) => key);

    if (missingElements.length > 0) {
      console.warn('Missing UI elements:', missingElements);
    }

    if (currentView === 'insights') {
      const now = Date.now();
      if (lastRenderedView !== currentView || now - lastChartRender > 5000) {
        lastRenderedView = currentView;
        lastChartRender = now;
        renderAnalytics();
      }
    }
  } catch (error) {
    console.error('Error updating UI:', error);
    showNotification('UI update failed - please refresh the page');
  }
}


// Settings View Logic
let authMode: 'login' | 'register' = 'login';

function toggleAuthMode(mode: 'login' | 'register') {
  authMode = mode;
  renderAnalytics(); // Re-render to show new form state
}

function renderSettingsView(): string {
  return `
    <div class="settings-layout">
      <div class="settings-header">
        <div class="header-content">
          <h2 class="settings-title">Settings</h2>
          <p class="settings-description">Manage your account and preferences</p>
        </div>
      </div>

      ${isSignedIn ? renderSignedInView() : renderSignedOutView()}
      
      <!-- General Settings -->
      <div class="cyber-card">
        <h3><span>⚙️</span> General</h3>
        <div class="setting-toggle-row">
          <span class="cyber-label" style="color: #ef4444;">Reset All Data</span>
          <button class="cyber-button danger" style="width: auto; padding: 0.4rem 1rem; font-size: 0.8rem;" onclick="showResetDataModal()">Reset</button>
        </div>
      </div>
    </div>
  `;
}

function renderSignedInView() {
  return `
    <div class="cyber-card">
      <h3><span>☁️</span> Cloud Sync</h3>
      
      <div class="user-profile-row">
        <div class="avatar-circle">
          ${currentUser?.email?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div class="profile-info">
          <h4>${currentUser?.email || 'User'}</h4>
          <div class="status-badge"><div class="status-dot"></div> Online & Syncing</div>
        </div>
      </div>

      <div class="sync-stats-row">
        <span>Last Sync: ${cloudSyncConfig.lastSync ? new Date(cloudSyncConfig.lastSync).toLocaleTimeString() : 'Never'}</span>
        <span>ID: ${currentUser?.id?.substr(0, 8)}...</span>
      </div>

      <div class="setting-toggle-row">
        <div>
          <span class="cyber-label">Auto-Sync</span>
          <span class="cyber-desc">Backup automatically</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" ${cloudSyncEnabled ? 'checked' : ''} onchange="toggleCloudSync(this.checked)">
          <span class="toggle-slider"></span>
        </label>
      </div>

      ${cloudSyncEnabled ? `
        <div class="input-group">
          <label>Sync Frequency</label>
          <select class="cyber-select" onchange="updateSyncInterval(this.value)">
            <option value="1" ${cloudSyncConfig.syncInterval === 1 ? 'selected' : ''}>Every Hour</option>
            <option value="6" ${cloudSyncConfig.syncInterval === 6 ? 'selected' : ''}>Every 6 Hours</option>
            <option value="24" ${cloudSyncConfig.syncInterval === 24 ? 'selected' : ''}>Daily</option>
          </select>
        </div>
      ` : ''}

      <div class="sync-actions-grid">
        <button class="cyber-button primary" onclick="manualSync()"><span>↻ Sync</span></button>
        <button class="cyber-button secondary" onclick="backupData()"><span>💾 Backup</span></button>
        <button class="cyber-button secondary" onclick="showRestoreModal()"><span>📥 Restore</span></button>
      </div>

      <div style="margin-top: 1.5rem; border-top: 1px solid var(--border-subtle); padding-top: 1rem;">
        <button class="cyber-button danger" onclick="signOut()">Sign Out</button>
      </div>
    </div>
  `;
}

function renderSignedOutView() {
  const isLogin = authMode === 'login';
  
  return `
    <div class="cyber-card">
      <h3><span>🔐</span> ${isLogin ? 'Welcome Back' : 'Create Account'}</h3>
      <p class="cyber-desc" style="margin-bottom: 1.5rem;">
        ${isLogin ? 'Sign in to sync your stats.' : 'Join now to backup your progress. No email verification needed.'}
      </p>

      <form id="auth-form" onsubmit="handleAuth(event)">
        <div class="input-group">
          <label>Email</label>
          <input type="email" name="auth-email" class="cyber-input" placeholder="user@example.com" required autocomplete="username">
        </div>
        
        <div class="input-group">
          <label>Password</label>
          <input type="password" name="auth-password" class="cyber-input" placeholder="••••••••" required autocomplete="current-password">
        </div>

        <button type="submit" class="cyber-button primary" id="auth-submit">
          <span class="btn-content">
            <span class="btn-text">${isLogin ? 'Log In' : 'Create Account'}</span>
            <span class="btn-loading hidden">Processing...</span>
          </span>
        </button>
        
        <div class="auth-mode-switch">
          ${isLogin ? "Don't have an account? " : "Already have an account? "}
          <span class="auth-link" onclick="toggleAuthMode('${isLogin ? 'register' : 'login'}')">
            ${isLogin ? 'Create one' : 'Log in'}
          </span>
        </div>
      </form>
    </div>
  `;
}

// Cloud sync authentication functions
function showAuthTab(mode: 'signin' | 'signup') {
  // Function kept for compatibility
  return;
}

// Supabase Configuration (Loaded from Environment Variables)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string;

// Diagnostic function to verify Supabase connection & schema
async function testConnection() {
  console.log('🔍 Testing Supabase connection...');
  
  try {
    // Initialize first if needed (using hardcoded env vars)
    if (!cloudSync.isEnabled()) {
        await cloudSync.initialize({
            enabled: true,
            supabaseUrl: SUPABASE_URL,
            supabaseKey: SUPABASE_KEY,
            autoSync: true
        });
    }

    const result = await cloudSync.checkConnection();

    if (result.success) {
      console.log(' Supabase Connection Successful! Table "user_typing_data" is reachable.');
      return true;
    } else {
      const error = result.error;
      console.error('❌ Connection Test Failed:', error);
      
      if (error?.code === 'PGRST301' || error?.message?.includes('does not exist')) {
        showNotification('Error: Table "user_typing_data" missing! Run the SQL script.');
      } else if (error?.code === '42501') {
        console.log(' Supabase Connected (RLS Active - Login required to see data).');
        return true; // Connected, just need to login
      } else {
        showNotification(`Connection Error: ${error?.message || 'Unknown error'}`);
      }
      return false;
    }
  } catch (err) {
    console.error('❌ Critical Network Error:', err);
    showNotification('❌ Critical: Cannot reach Supabase URL');
    return false;
  }
}

async function handleAuth(event: Event) {
  event.preventDefault();
  
  // Run diagnostics first
  await testConnection();

  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const email = formData.get('auth-email') as string;
  const password = formData.get('auth-password') as string;
  
  if (!email || !password) {
    showNotification('Please fill in email and password');
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

    // Initialize cloud sync with hardcoded config
    const success = await cloudSync.initialize({
      enabled: true,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      autoSync: true,
      syncInterval: 24
    });

    if (!success) {
      throw new Error('Failed to connect to sync server.');
    }

    let result;

    if (authMode === 'register') {
      // Explicit Sign Up Flow
      console.log('Creating new account...');
      result = await cloudSync.signUp(email, password);
      
      if (result.user) {
        showNotification('✨ Account created successfully!');
      }
    } else {
      // Explicit Login Flow
      console.log('Logging in...');
      result = await cloudSync.signIn(email, password);
    }

    if (result.error) {
      throw result.error;
    }

    if (result.user) {
      currentUser = result.user;
      isSignedIn = true;
      cloudSyncEnabled = true;

      showNotification(authMode === 'login' ? '👋 Welcome back!' : '✨ Welcome!');

      // Refresh settings view
      if (currentView === 'settings') {
        renderAnalytics();
      }

      // Trigger initial sync
      setTimeout(() => manualSync(), 1000);
    }
  } catch (error: any) {
    console.error('Authentication error:', error);
    console.log('Full error details:', JSON.stringify(error, null, 2));
    
    // Try to extract the most useful message
    const msg = error.message || error.error_description || error.msg || 'Connection failed';
    showNotification(`Error: ${msg}`);
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
      longestStreak,
      firstUsedDate,
      lastActiveDate: getLocalDateString() // Send current date as last active if backing up now
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
      longestStreak,
      firstUsedDate,
      lastActiveDate: getLocalDateString()
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

      // Persist synced data to main process
      window.electronAPI.updateUserData(result.mergedData);

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
    const localData = {
      totalKeystrokes,
      dailyKeystrokes: dailyData,
      hourlyKeystrokes: hourlyData,
      achievements,
      userLevel,
      userXP,
      personalityType,
      streakDays,
      longestStreak,
      firstUsedDate,
      lastActiveDate,
      challenges,
      goals
    };

    const result = await cloudSync.syncData(localData);
    if (result.success && result.mergedData) {
      totalKeystrokes = result.mergedData.totalKeystrokes;
      dailyData = result.mergedData.dailyKeystrokes;
      hourlyData = result.mergedData.hourlyKeystrokes;
      achievements = result.mergedData.achievements;
      userLevel = result.mergedData.userLevel;
      userXP = result.mergedData.userXP;
      personalityType = result.mergedData.personalityType;
      streakDays = result.mergedData.streakDays;
      longestStreak = result.mergedData.longestStreak;
      firstUsedDate = result.mergedData.firstUsedDate;
      lastActiveDate = result.mergedData.lastActiveDate;
      challenges = result.mergedData.challenges || [];
      goals = result.mergedData.goals || [];

      window.electronAPI.updateUserData(result.mergedData);
      updateUI();
      hideRestoreModal();
      showNotification(' Data synced successfully!');
    }
  } catch (error: any) {
    showNotification(` Sync failed: ${error.message}`);
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
  console.log('🚀 Initializing Cloud Sync...');
  console.log('URL:', SUPABASE_URL ? 'Set' : 'Missing');
  console.log('Key:', SUPABASE_KEY ? 'Set' : 'Missing');

  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('YOUR_NEW')) {
    console.warn('Supabase credentials missing or default in .env');
    return;
  }

  try {
    const success = await cloudSync.initialize({
      enabled: true,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
      autoSync: true,
      syncInterval: 24
    });

    if (success) {
      console.log(' Cloud Sync Service Ready');
      isSignedIn = cloudSync.isAuthenticated();
      currentUser = cloudSync.getCurrentUser();
      cloudSyncEnabled = true;

      if (cloudSyncEnabled && cloudSync.shouldSync()) {
        setTimeout(() => manualSync(), 2000);
      }
    } else {
      console.error('❌ Cloud Sync failed to initialize (Check console)');
    }
  } catch (error) {
    console.warn('❌ Failed to initialize cloud sync:', error);
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
    default: return '';
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

window.electronAPI.onLevelUp((data) => {
  userLevel = data.level;
  userXP = data.xp;
  updateUI();
  showCelebration('levelup', `Level Up!`, `You reached Level ${data.level}!`);
});

// Request initial data on load
window.electronAPI.requestData();

// Make functions globally available for onclick handlers
(window as any).showCreateGoalModal = showCreateGoalModal;
(window as any).hideCreateGoalModal = hideCreateGoalModal;
(window as any).createNewGoal = createNewGoal;
(window as any).showAuthTab = showAuthTab;
(window as any).handleAuth = handleAuth;
(window as any).toggleAuthMode = toggleAuthMode;
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
(window as any).switchChartTimeframe = switchChartTimeframe;

window.addEventListener('error', (event) => {
  showNotification('An error occurred - please refresh the page');
  event.preventDefault();
});

window.addEventListener('unhandledrejection', (event) => {
  showNotification('An error occurred - please refresh the page');
  event.preventDefault();
});

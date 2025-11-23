import './index.css';
// Analytics functions moved to gamification.ts or removed
// import { getWeeklyAnalytics, getMonthlyAnalytics } from './gamification';
import {
  ACHIEVEMENT_DEFINITIONS,
  calculateLevel,
  getXPToNextLevel
} from './gamification';
import { cloudSync, CloudSyncConfig } from './cloudSync';

declare global {
  interface Window {
    electronAPI: {
      onKeystrokeUpdate: (callback: (data: any) => void) => void;
      onInitialData: (callback: (data: any) => void) => void;
      onAchievementUnlocked: (callback: (achievement: string) => void) => void;
      onChallengeCompleted: (callback: (challenge: any) => void) => void;
      requestData: () => void;
      createGoal: (goalData: any) => void;
      sendManualKeystroke: () => void;
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
let sessionKeystrokes = 0;
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
let currentView: 'today' | 'week' | 'month' | 'year' | 'insights' | 'achievements' | 'challenges' | 'goals' | 'settings' = 'today';

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

// Create the dashboard UI
function createDashboard() {
  document.body.innerHTML = `
    <div class="container">
      <header>
        <h1>TypeCount</h1>
        <p class="tagline">Your Digital Typing Footprint</p>

        <!-- User Level & XP Display -->
        <div class="user-level">
          <div class="level-badge">
            <span class="level-number" id="user-level">1</span>
            <span class="level-label">Level</span>
          </div>
          <div class="xp-bar">
            <div class="xp-progress" id="xp-progress" style="width: 0%"></div>
            <span class="xp-text" id="xp-text">0 / 1000 XP</span>
          </div>
          <div class="personality-type" id="personality-type"></div>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card primary">
          <div class="stat-value" id="total-count">0</div>
          <div class="stat-label">Total Keystrokes</div>
          <div class="stat-icon">🎯</div>
        </div>

        <div class="stat-card">
          <div class="stat-value" id="today-count">0</div>
          <div class="stat-label">Today</div>
          <div class="stat-icon">📅</div>
        </div>

        <div class="stat-card">
          <div class="stat-value" id="session-count">0</div>
          <div class="stat-label">Current Session</div>
          <div class="stat-icon">⏱️</div>
        </div>

        <div class="stat-card">
          <div class="stat-value" id="streak-count">0</div>
          <div class="stat-label">Day Streak</div>
          <div class="stat-icon">🔥</div>
        </div>
      </div>

      <!-- Analytics Tabs -->
      <div class="analytics-section">
        <div class="tabs">
          <button class="tab-button active" data-view="today">Today</button>
          <button class="tab-button" data-view="week">Week</button>
          <button class="tab-button" data-view="month">Month</button>
          <button class="tab-button" data-view="year">Year</button>
          <button class="tab-button" data-view="insights">Insights</button>
          <button class="tab-button" data-view="achievements">🏆 Achievements</button>
          <button class="tab-button" data-view="challenges">🎯 Challenges</button>
          <button class="tab-button" data-view="goals">📋 Goals</button>
          <button class="tab-button" data-view="settings">⚙️ Settings</button>
          <button class="tab-button test-button" onclick="testKeystroke()">🧪 Test</button>
        </div>

        <div class="tab-content" id="analytics-content">
          <!-- Dynamic content based on selected tab -->
        </div>
      </div>

      <div class="achievements-section">
        <h2>Achievements</h2>
        <div class="achievements-grid" id="achievements-grid">
          <!-- Achievements will be added here -->
        </div>
      </div>

      <!-- Export Section -->
      <div class="export-section">
        <h3>Export Your Data</h3>
        <div class="export-buttons">
          <button id="export-csv" class="export-btn">Export as CSV</button>
          <button id="export-json" class="export-btn">Export as JSON</button>
        </div>
      </div>

      <div id="notification" class="notification"></div>
    </div>
  `;

  // Add tab event listeners
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      const view = target.dataset.view as typeof currentView;

      // Update active tab
      document.querySelectorAll('.tab-button').forEach(btn => {
        if (btn) btn.classList.remove('active');
      });
      if (target) target.classList.add('active');

      currentView = view;
      renderAnalytics();
    });
  });

  // Add export event listeners
  document.getElementById('export-csv')?.addEventListener('click', handleExportCSV);
  document.getElementById('export-json')?.addEventListener('click', handleExportJSON);
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
      case 'today':
        renderTodayView(contentEl);
        break;
      case 'week':
        renderWeekView(contentEl);
        break;
      case 'month':
        renderMonthView(contentEl);
        break;
      case 'year':
        renderYearView(contentEl);
        break;
      case 'insights':
        renderInsightsView(contentEl);
        break;
      case 'achievements':
        renderAchievementsView(contentEl);
        break;
      case 'challenges':
        renderChallengesView(contentEl);
        break;
      case 'goals':
        renderGoalsView(contentEl);
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

// Render today's view
function renderTodayView(container: HTMLElement) {
  const today = new Date().toISOString().split('T')[0];
  const todayHours = hourlyData[today] || new Array(24).fill(0);

  container.innerHTML = `
    <div class="chart-section">
      <h2>Today's Activity</h2>
      <div class="hourly-chart" id="hourly-chart">
        ${createHourlyChart(todayHours)}
      </div>
    </div>
  `;
}

// Render week view
function renderWeekView(container: HTMLElement) {
  const weekData = getWeeklyAnalytics(dailyData, hourlyData);

  container.innerHTML = `
    <div class="chart-section">
      <h2>This Week</h2>
      <div class="stats-summary">
        <div class="summary-item">
          <span class="summary-label">Total:</span>
          <span class="summary-value">${formatNumber(weekData.total)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Daily Average:</span>
          <span class="summary-value">${formatNumber(weekData.dailyAverage)}</span>
        </div>
      </div>
      <div class="weekly-chart">
        ${createDailyChart(weekData.days)}
      </div>
    </div>
  `;
}

// Render month view
function renderMonthView(container: HTMLElement) {
  const monthData = getMonthlyAnalytics(dailyData, hourlyData);

  container.innerHTML = `
    <div class="chart-section">
      <h2>${monthData.month} ${monthData.year}</h2>
      <div class="stats-summary">
        <div class="summary-item">
          <span class="summary-label">Total:</span>
          <span class="summary-value">${formatNumber(monthData.total)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Daily Average:</span>
          <span class="summary-value">${formatNumber(monthData.dailyAverage)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Best Day:</span>
          <span class="summary-value">${monthData.topDay.date} (${formatNumber(monthData.topDay.count)})</span>
        </div>
      </div>
      <div class="monthly-chart">
        ${createDailyChart(monthData.days)}
      </div>
    </div>
  `;
}

// Render year view
function renderYearView(container: HTMLElement) {
  const yearData = getYearlyAnalytics(dailyData);

  container.innerHTML = `
    <div class="chart-section">
      <h2>Year ${yearData.year}</h2>
      <div class="stats-summary">
        <div class="summary-item">
          <span class="summary-label">Total:</span>
          <span class="summary-value">${formatNumber(yearData.total)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Monthly Average:</span>
          <span class="summary-value">${formatNumber(yearData.monthlyAverage)}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Best Month:</span>
          <span class="summary-value">${yearData.topMonth.month} (${formatNumber(yearData.topMonth.count)})</span>
        </div>
      </div>
      <div class="yearly-chart">
        ${createMonthlyChart(yearData.months)}
      </div>
    </div>
  `;
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
          <div class="insight-icon">⏰</div>
          <div class="insight-content">
            <div class="insight-label">Peak Productivity Hour</div>
            <div class="insight-value">${insights.peakHour}:00 - ${insights.peakHour + 1}:00</div>
            <div class="insight-detail">Average: ${formatNumber(insights.peakHourAverage)} keystrokes</div>
          </div>
        </div>

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
          <div class="insight-icon">🏆</div>
          <div class="insight-content">
            <div class="insight-label">Most Productive Day</div>
            <div class="insight-value">${insights.mostProductiveDay || 'No data yet'}</div>
            <div class="insight-detail">Your personal record</div>
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

// Create hourly chart
function createHourlyChart(hourlyData: number[]): string {
  const maxValue = Math.max(...hourlyData, 1);

  return `
    <div class="chart-bars">
      ${hourlyData.map((value, hour) => {
        const height = (value / maxValue) * 100;
        return `
          <div class="chart-bar-container">
            <div class="chart-bar" style="height: ${height}%">
              <span class="chart-value">${value > 0 ? formatNumber(value) : ''}</span>
            </div>
            <span class="chart-label">${hour.toString().padStart(2, '0')}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Create daily chart
function createDailyChart(days: { date: string; count: number }[]): string {
  const maxValue = Math.max(...days.map(d => d.count), 1);

  return `
    <div class="chart-bars">
      ${days.map(day => {
        const height = (day.count / maxValue) * 100;
        const dateObj = new Date(day.date);
        const label = dateObj.toLocaleDateString('en', { month: 'short', day: 'numeric' });

        return `
          <div class="chart-bar-container">
            <div class="chart-bar" style="height: ${height}%">
              <span class="chart-value">${day.count > 0 ? formatNumber(day.count) : ''}</span>
            </div>
            <span class="chart-label">${label}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Create monthly chart
function createMonthlyChart(months: { month: string; count: number }[]): string {
  const maxValue = Math.max(...months.map(m => m.count), 1);

  return `
    <div class="chart-bars">
      ${months.map(month => {
        const height = (month.count / maxValue) * 100;
        const label = month.month.substring(0, 3);

        return `
          <div class="chart-bar-container">
            <div class="chart-bar" style="height: ${height}%">
              <span class="chart-value">${month.count > 0 ? formatNumber(month.count) : ''}</span>
            </div>
            <span class="chart-label">${label}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Render achievements view
function renderAchievementsView(): string {
  const categories = ['milestone', 'streak', 'time', 'special', 'challenge'];

  return `
    <div class="achievements-container">
      <div class="achievements-header">
        <h3>🏆 Achievements</h3>
        <div class="achievement-stats">
          <span class="stat-item">
            <strong>${achievements.length}</strong> unlocked
          </span>
          <span class="stat-item">
            <strong>Level ${userLevel}</strong>
            <small>(${userXP} XP)</small>
          </span>
        </div>
      </div>

      ${categories.map(category => {
        const categoryAchievements = achievements.filter(a => a.category === category);
        const totalInCategory = ACHIEVEMENT_DEFINITIONS.filter(def => def.category === category).length;

        return `
          <div class="achievement-category">
            <h4>${category.charAt(0).toUpperCase() + category.slice(1)}
              <span class="category-progress">(${categoryAchievements.length}/${totalInCategory})</span>
            </h4>
            <div class="achievement-grid">
              ${categoryAchievements.map(achievement => `
                <div class="achievement-card unlocked">
                  <div class="achievement-icon">${achievement.icon}</div>
                  <div class="achievement-details">
                    <h5>${achievement.name}</h5>
                    <p>${achievement.description}</p>
                    <small>Unlocked: ${new Date(achievement.unlockedAt).toLocaleDateString()}</small>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Render challenges view
function renderChallengesView(): string {
  const activeChallenges = challenges.filter(c => !c.completed);
  const completedChallenges = challenges.filter(c => c.completed);

  return `
    <div class="challenges-container">
      <div class="challenges-header">
        <h3>🎯 Challenges</h3>
        <div class="challenge-stats">
          <span class="stat-item">
            <strong>${activeChallenges.length}</strong> active
          </span>
          <span class="stat-item">
            <strong>${completedChallenges.length}</strong> completed
          </span>
        </div>
      </div>

      ${activeChallenges.length > 0 ? `
        <div class="challenge-section">
          <h4>🔥 Active Challenges</h4>
          <div class="challenges-grid">
            ${activeChallenges.map(challenge => {
              const progress = Math.min((challenge.progress / challenge.target) * 100, 100);
              const timeLeft = new Date(challenge.endDate).getTime() - Date.now();
              const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));

              return `
                <div class="challenge-card active">
                  <div class="challenge-header">
                    <h5>${challenge.name}</h5>
                    <span class="challenge-type ${challenge.type}">${challenge.type}</span>
                  </div>
                  <p>${challenge.description}</p>
                  <div class="challenge-progress">
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <span class="progress-text">${challenge.progress}/${challenge.target}</span>
                  </div>
                  <div class="challenge-footer">
                    <span class="time-left">${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</span>
                    ${challenge.reward ? `<span class="reward">🎁 ${challenge.reward}</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${completedChallenges.length > 0 ? `
        <div class="challenge-section">
          <h4> Recent Completions</h4>
          <div class="challenges-grid">
            ${completedChallenges.slice(-6).map(challenge => `
              <div class="challenge-card completed">
                <div class="challenge-header">
                  <h5>${challenge.name} ✓</h5>
                  <span class="challenge-type ${challenge.type}">${challenge.type}</span>
                </div>
                <p>${challenge.description}</p>
                <div class="challenge-completion">
                  <span class="completion-text">Completed ${new Date(challenge.endDate).toLocaleDateString()}</span>
                  ${challenge.reward ? `<span class="reward earned">🎁 ${challenge.reward}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${activeChallenges.length === 0 && completedChallenges.length === 0 ? `
        <div class="empty-state">
          <p>No challenges available yet. Start typing to unlock your first challenge!</p>
        </div>
      ` : ''}
    </div>
  `;
}

// Render goals view
function renderGoalsView(): string {
  const activeGoals = goals.filter(g => !g.completed);
  const completedGoals = goals.filter(g => g.completed);

  return `
    <div class="goals-container">
      <div class="goals-header">
        <h3>🎯 Personal Goals</h3>
        <div class="goals-stats">
          <span class="stat-item">
            <strong>${activeGoals.length}</strong> active
          </span>
          <span class="stat-item">
            <strong>${completedGoals.length}</strong> achieved
          </span>
        </div>
        <button class="create-goal-btn" onclick="showCreateGoalModal()">+ Create Goal</button>
      </div>

      ${activeGoals.length > 0 ? `
        <div class="goals-section">
          <h4>🎯 Active Goals</h4>
          <div class="goals-list">
            ${activeGoals.map(goal => {
              const progress = Math.min((goal.current / goal.target) * 100, 100);
              const isOverdue = goal.targetDate && new Date(goal.targetDate) < new Date();

              return `
                <div class="goal-card ${isOverdue ? 'overdue' : ''}">
                  <div class="goal-header">
                    <h5>${goal.name}</h5>
                    <span class="goal-type ${goal.type}">${goal.type}</span>
                  </div>
                  <p>${goal.description}</p>
                  <div class="goal-progress">
                    <div class="progress-bar large">
                      <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="progress-details">
                      <span class="progress-text">${goal.current.toLocaleString()} / ${goal.target.toLocaleString()}</span>
                      <span class="progress-percent">${progress.toFixed(1)}%</span>
                    </div>
                  </div>
                  ${goal.targetDate ? `
                    <div class="goal-timeline">
                      <span class="timeline-label">Target:</span>
                      <span class="target-date ${isOverdue ? 'overdue' : ''}">${new Date(goal.targetDate).toLocaleDateString()}</span>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${completedGoals.length > 0 ? `
        <div class="goals-section">
          <h4>🏆 Achieved Goals</h4>
          <div class="goals-list">
            ${completedGoals.slice(-5).map(goal => `
              <div class="goal-card completed">
                <div class="goal-header">
                  <h5>${goal.name} ✓</h5>
                  <span class="goal-type ${goal.type}">${goal.type}</span>
                </div>
                <p>${goal.description}</p>
                <div class="goal-achievement">
                  <span class="achievement-text">🎉 Goal achieved!</span>
                  <span class="achievement-date">Completed: ${new Date().toLocaleDateString()}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${activeGoals.length === 0 && completedGoals.length === 0 ? `
        <div class="empty-state">
          <h4>🚀 Ready to set your first goal?</h4>
          <p>Create a personal typing goal to track your progress and stay motivated!</p>
          <button class="create-goal-btn primary" onclick="showCreateGoalModal()">Create Your First Goal</button>
        </div>
      ` : ''}
    </div>

    <!-- Goal Creation Modal (hidden by default) -->
    <div id="goalModal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">
          <h4>🎯 Create New Goal</h4>
          <button class="close-btn" onclick="hideCreateGoalModal()">&times;</button>
        </div>
        <form id="goalForm" onsubmit="createNewGoal(event)">
          <div class="form-group">
            <label for="goalName">Goal Name:</label>
            <input type="text" id="goalName" required placeholder="e.g., Type 10,000 keystrokes this week">
          </div>
          <div class="form-group">
            <label for="goalDescription">Description:</label>
            <textarea id="goalDescription" placeholder="Optional description for your goal"></textarea>
          </div>
          <div class="form-group">
            <label for="goalTarget">Target (keystrokes):</label>
            <input type="number" id="goalTarget" required min="1" placeholder="e.g., 10000">
          </div>
          <div class="form-group">
            <label for="goalType">Goal Type:</label>
            <select id="goalType" required>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div class="form-group">
            <label for="goalTargetDate">Target Date (optional):</label>
            <input type="date" id="goalTargetDate">
          </div>
          <div class="form-actions">
            <button type="button" class="cancel-btn" onclick="hideCreateGoalModal()">Cancel</button>
            <button type="submit" class="create-btn">Create Goal</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// Handle CSV export
function handleExportCSV() {
  try {
    const csv = exportToCSV(dailyData, hourlyData);
    downloadFile(csv, 'typecount-data.csv', 'text/csv');
  } catch (error) {
    console.error('Error exporting CSV:', error);
    showNotification('Failed to export CSV data. Please try again.');
  }
}

// Handle JSON export
function handleExportJSON() {
  try {
    const json = exportToJSON({
      totalKeystrokes,
      dailyKeystrokes: dailyData,
      hourlyKeystrokes: hourlyData,
      achievements,
      streakDays,
      firstUsedDate
    });
    downloadFile(json, 'typecount-data.json', 'application/json');
  } catch (error) {
    console.error('Error exporting JSON:', error);
    showNotification('Failed to export JSON data. Please try again.');
  }
}

// Download file utility
function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showNotification(`Data exported to ${filename}`);
}

// Update the UI with new data
function updateUI() {
  try {
    const elements = {
      totalEl: document.getElementById('total-count'),
      todayEl: document.getElementById('today-count'),
      sessionEl: document.getElementById('session-count'),
      streakEl: document.getElementById('streak-count')
    };

    // Update basic stats with error handling
    if (elements.totalEl) elements.totalEl.textContent = formatNumber(totalKeystrokes);
    if (elements.todayEl) elements.todayEl.textContent = formatNumber(todayKeystrokes);
    if (elements.sessionEl) elements.sessionEl.textContent = formatNumber(sessionKeystrokes);
    if (elements.streakEl) elements.streakEl.textContent = `${streakDays}`;

    // Log missing critical elements
    const missingElements = Object.entries(elements)
      .filter(([_, element]) => !element)
      .map(([key]) => key);

    if (missingElements.length > 0) {
      console.warn('Missing UI elements:', missingElements);
    }

    updateAchievements();
    renderAnalytics();
  } catch (error) {
    console.error('Error updating UI:', error);
    showNotification('UI update failed - please refresh the page');
  }
}

// Update achievements display
function updateAchievements() {
  const achievementsGrid = document.getElementById('achievements-grid');
  if (!achievementsGrid) return;

  const allAchievements = [
    { id: '1K_keystrokes', name: '1K Keystrokes', icon: '🥉', unlocked: false },
    { id: '10K_keystrokes', name: '10K Keystrokes', icon: '🥈', unlocked: false },
    { id: '100K_keystrokes', name: '100K Keystrokes', icon: '🥇', unlocked: false },
    { id: '1M_keystrokes', name: '1M Keystrokes', icon: '💎', unlocked: false }
  ];

  // Mark unlocked achievements
  allAchievements.forEach(ach => {
    if (achievements.includes(ach.id)) {
      ach.unlocked = true;
    }
  });

  achievementsGrid.innerHTML = allAchievements.map(ach => `
    <div class="achievement ${ach.unlocked ? 'unlocked' : 'locked'}">
      <div class="achievement-icon">${ach.icon}</div>
      <div class="achievement-name">${ach.name}</div>
    </div>
  `).join('');
}

// Render settings view
function renderSettingsView(): string {
  return `
    <div class="settings-container">
      <div class="settings-header">
        <h3>⚙️ Settings</h3>
        <p>Manage your TypeCount preferences and cloud sync</p>
      </div>

      <!-- Cloud Sync Section -->
      <div class="settings-section">
        <div class="section-header">
          <h4>☁️ Cloud Sync</h4>
          <p class="section-description">Sync your typing data across devices (optional)</p>
        </div>

        <div class="cloud-sync-status">
          <div class="sync-status-indicator ${isSignedIn ? 'connected' : 'disconnected'}">
            <span class="status-dot"></span>
            <span class="status-text">
              ${isSignedIn ? ` Connected as ${currentUser?.email || 'User'}` : '⚪ Not connected'}
            </span>
          </div>
        </div>

        ${!isSignedIn ? `
          <div class="auth-section">
            <div class="auth-tabs">
              <button class="auth-tab active" onclick="showAuthTab('signin')">Sign In</button>
              <button class="auth-tab" onclick="showAuthTab('signup')">Create Account</button>
            </div>

            <form id="auth-form" class="auth-form" onsubmit="handleAuth(event)">
              <div class="form-group">
                <label for="auth-email">Email:</label>
                <input type="email" id="auth-email" required placeholder="your@email.com">
              </div>
              <div class="form-group">
                <label for="auth-password">Password:</label>
                <input type="password" id="auth-password" required placeholder="Password (min 6 chars)">
              </div>
              <div class="form-actions">
                <button type="submit" class="auth-submit-btn" id="auth-submit">
                  <span class="btn-text">Sign In</span>
                  <span class="btn-loading hidden">⏳ Please wait...</span>
                </button>
              </div>
              <input type="hidden" id="auth-mode" value="signin">
            </form>

            <div class="privacy-notice">
              <p><strong>Privacy First:</strong> Your typing data is encrypted and only accessible by you.
              Cloud sync is completely optional and you can disable it anytime.</p>
            </div>
          </div>
        ` : `
          <div class="sync-controls">
            <div class="sync-settings">
              <label class="setting-item">
                <input type="checkbox" ${cloudSyncEnabled ? 'checked' : ''} onchange="toggleCloudSync(this.checked)">
                <span class="checkmark"></span>
                <span class="setting-label">Enable automatic cloud sync</span>
              </label>

              <div class="sync-frequency">
                <label for="sync-interval">Sync frequency:</label>
                <select id="sync-interval" onchange="updateSyncInterval(this.value)">
                  <option value="1" ${cloudSyncConfig.syncInterval === 1 ? 'selected' : ''}>Every hour</option>
                  <option value="6" ${cloudSyncConfig.syncInterval === 6 ? 'selected' : ''}>Every 6 hours</option>
                  <option value="24" ${cloudSyncConfig.syncInterval === 24 ? 'selected' : ''}>Daily</option>
                  <option value="168" ${cloudSyncConfig.syncInterval === 168 ? 'selected' : ''}>Weekly</option>
                </select>
              </div>

              <div class="sync-actions">
                <button class="sync-btn" onclick="manualSync()">🔄 Sync Now</button>
                <button class="backup-btn" onclick="backupData()">💾 Backup Data</button>
                <button class="restore-btn" onclick="showRestoreModal()">📥 Restore Data</button>
              </div>

              ${cloudSyncConfig.lastSync ? `
                <div class="sync-info">
                  <p class="last-sync">Last sync: ${new Date(cloudSyncConfig.lastSync).toLocaleString()}</p>
                </div>
              ` : ''}
            </div>

            <div class="account-actions">
              <button class="sign-out-btn" onclick="signOut()">Sign Out</button>
            </div>
          </div>
        `}
      </div>

      <!-- Data Management Section -->
      <div class="settings-section">
        <div class="section-header">
          <h4>📊 Data Management</h4>
          <p class="section-description">Export or reset your typing data</p>
        </div>

        <div class="data-actions">
          <button class="export-btn" onclick="handleExportCSV()">📄 Export CSV</button>
          <button class="export-btn" onclick="handleExportJSON()">📄 Export JSON</button>
          <button class="reset-btn" onclick="showResetDataModal()">🗑️ Reset All Data</button>
        </div>

        <div class="data-info">
          <div class="data-stat">
            <span class="stat-label">Total keystrokes:</span>
            <span class="stat-value">${formatNumber(totalKeystrokes)}</span>
          </div>
          <div class="data-stat">
            <span class="stat-label">Days tracked:</span>
            <span class="stat-value">${Object.keys(dailyData).length}</span>
          </div>
          <div class="data-stat">
            <span class="stat-label">First used:</span>
            <span class="stat-value">${firstUsedDate ? new Date(firstUsedDate).toLocaleDateString() : 'Unknown'}</span>
          </div>
        </div>
      </div>

      <!-- Data Reset Confirmation Modal -->
      <div id="resetDataModal" class="modal hidden">
        <div class="modal-content">
          <div class="modal-header">
            <h4>⚠️ Reset All Data</h4>
            <button class="close-btn" onclick="hideResetDataModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p><strong>This action cannot be undone!</strong></p>
            <p>This will permanently delete all your typing data including:</p>
            <ul>
              <li>All keystroke counts</li>
              <li>Achievement progress</li>
              <li>Goals and challenges</li>
              <li>Historical data</li>
            </ul>
            <p>Make sure you have exported your data if you want to keep a backup.</p>
          </div>
          <div class="form-actions">
            <button type="button" class="cancel-btn" onclick="hideResetDataModal()">Cancel</button>
            <button type="button" class="reset-confirm-btn" onclick="confirmResetData()">Reset All Data</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Cloud sync authentication functions
async function showAuthTab(mode: 'signin' | 'signup') {
  const signinTab = document.querySelector('.auth-tab:first-child') as HTMLElement;
  const signupTab = document.querySelector('.auth-tab:last-child') as HTMLElement;
  const submitBtn = document.getElementById('auth-submit') as HTMLElement;
  const authMode = document.getElementById('auth-mode') as HTMLInputElement;

  if (!signinTab || !signupTab || !submitBtn || !authMode) return;

  // Update tab states
  signinTab.classList.toggle('active', mode === 'signin');
  signupTab.classList.toggle('active', mode === 'signup');

  // Update button text
  const btnText = submitBtn.querySelector('.btn-text');
  if (btnText) {
    btnText.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  }

  // Update hidden mode
  authMode.value = mode;
}

async function handleAuth(event: Event) {
  event.preventDefault();

  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const email = formData.get('auth-email') as string;
  const password = formData.get('auth-password') as string;
  const mode = formData.get('auth-mode') as string;

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

    // Attempt authentication
    const result = mode === 'signin'
      ? await cloudSync.signIn(email, password)
      : await cloudSync.signUp(email, password);

    if (result.error) {
      throw new Error(result.error.message || 'Authentication failed');
    }

    if (result.user) {
      currentUser = result.user;
      isSignedIn = true;
      cloudSyncEnabled = true;

      showNotification(` Successfully ${mode === 'signin' ? 'signed in' : 'created account'}!`);

      // Refresh settings view
      if (currentView === 'settings') {
        renderAnalytics();
      }

      // Trigger initial sync
      setTimeout(() => manualSync(), 1000);
    }
  } catch (error: any) {
    console.error('Authentication error:', error);
    showNotification(` ${error.message || 'Authentication failed'}`);
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
    sessionKeystrokes = 0;
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
  sessionKeystrokes = data.session;
  todayKeystrokes = data.today;
  updateUI();
});

window.electronAPI.onInitialData((data) => {
  totalKeystrokes = data.total;
  sessionKeystrokes = data.session;
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
  updateAchievements();

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
  if (currentView === 'challenges') {
    renderAnalytics();
  }
});

// Request initial data on load
window.electronAPI.requestData();

// Test function for manual keystroke simulation
function testKeystroke() {
  if (window.electronAPI.sendManualKeystroke) {
    window.electronAPI.sendManualKeystroke();
    console.log('Test keystroke sent!');
  }
}

// Make the function globally available
(window as any).testKeystroke = testKeystroke;
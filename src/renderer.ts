import './index.css';
import {
  getWeeklyAnalytics,
  getMonthlyAnalytics,
  getYearlyAnalytics,
  getProductivityInsights,
  exportToCSV,
  exportToJSON
} from './analytics';

declare global {
  interface Window {
    electronAPI: {
      onKeystrokeUpdate: (callback: (data: any) => void) => void;
      onInitialData: (callback: (data: any) => void) => void;
      onAchievementUnlocked: (callback: (achievement: string) => void) => void;
      requestData: () => void;
    };
  }
}

// State
let totalKeystrokes = 0;
let sessionKeystrokes = 0;
let todayKeystrokes = 0;
let streakDays = 0;
let achievements: string[] = [];
let dailyData: Record<string, number> = {};
let hourlyData: Record<string, number[]> = {};
let firstUsedDate = '';

// Current view state
let currentView: 'today' | 'week' | 'month' | 'year' | 'insights' = 'today';

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
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      target.classList.add('active');

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
  if (!contentEl) return;

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
  const totalEl = document.getElementById('total-count');
  const todayEl = document.getElementById('today-count');
  const sessionEl = document.getElementById('session-count');
  const streakEl = document.getElementById('streak-count');

  if (totalEl) totalEl.textContent = formatNumber(totalKeystrokes);
  if (todayEl) todayEl.textContent = formatNumber(todayKeystrokes);
  if (sessionEl) sessionEl.textContent = formatNumber(sessionKeystrokes);
  if (streakEl) streakEl.textContent = `${streakDays}`;

  updateAchievements();
  renderAnalytics();
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

// Initialize the app
createDashboard();

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
  dailyData = data.dailyData || {};
  hourlyData = data.hourlyData || {};
  firstUsedDate = data.firstUsedDate || new Date().toISOString();

  updateUI();
});

window.electronAPI.onAchievementUnlocked((achievement) => {
  achievements.push(achievement);
  updateAchievements();

  const achievementNames: Record<string, string> = {
    '1K_keystrokes': '1,000 Keystrokes!',
    '10K_keystrokes': '10,000 Keystrokes!',
    '100K_keystrokes': '100,000 Keystrokes!',
    '1M_keystrokes': '1 Million Keystrokes!'
  };

  showNotification(`🎉 Achievement Unlocked: ${achievementNames[achievement] || achievement}`);
});

// Request initial data on load
window.electronAPI.requestData();
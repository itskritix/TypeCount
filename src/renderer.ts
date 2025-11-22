import './index.css';

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

      <div class="achievements-section">
        <h2>Achievements</h2>
        <div class="achievements-grid" id="achievements-grid">
          <!-- Achievements will be added here -->
        </div>
      </div>

      <div class="chart-section">
        <h2>Today's Activity</h2>
        <div class="hourly-chart" id="hourly-chart">
          <!-- Hourly chart will be rendered here -->
        </div>
      </div>

      <div id="notification" class="notification"></div>
    </div>
  `;
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

// Create hourly chart
function createHourlyChart(hourlyData: number[]) {
  const chartEl = document.getElementById('hourly-chart');
  if (!chartEl || !hourlyData) return;

  const maxValue = Math.max(...hourlyData, 1);

  chartEl.innerHTML = `
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

  // Create hourly chart for today
  const today = new Date().toISOString().split('T')[0];
  const todayHourlyData = data.hourlyData?.[today] || new Array(24).fill(0);
  createHourlyChart(todayHourlyData);

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
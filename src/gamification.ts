// Gamification system for TypeCount

// Type definitions matching main.ts
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

// Comprehensive achievement definitions
export const ACHIEVEMENT_DEFINITIONS = [
  // Milestone achievements
  { id: 'first_keystroke', name: 'First Steps', description: 'Your first keystroke!', icon: '', category: 'milestone', threshold: 1 },
  { id: 'hundred_keystrokes', name: 'Getting Started', description: 'Typed 100 keystrokes', icon: '🌱', category: 'milestone', threshold: 100 },
  { id: '1k_keystrokes', name: 'Bronze Typist', description: 'Typed 1,000 keystrokes', icon: '🥉', category: 'milestone', threshold: 1000 },
  { id: '5k_keystrokes', name: 'Active Typist', description: 'Typed 5,000 keystrokes', icon: '⚡', category: 'milestone', threshold: 5000 },
  { id: '10k_keystrokes', name: 'Silver Typist', description: 'Typed 10,000 keystrokes', icon: '🥈', category: 'milestone', threshold: 10000 },
  { id: '25k_keystrokes', name: 'Dedicated Typist', description: 'Typed 25,000 keystrokes', icon: '💪', category: 'milestone', threshold: 25000 },
  { id: '50k_keystrokes', name: 'Serious Typist', description: 'Typed 50,000 keystrokes', icon: '🔥', category: 'milestone', threshold: 50000 },
  { id: '100k_keystrokes', name: 'Gold Typist', description: 'Typed 100,000 keystrokes', icon: '🥇', category: 'milestone', threshold: 100000 },
  { id: '250k_keystrokes', name: 'Expert Typist', description: 'Typed 250,000 keystrokes', icon: '🏆', category: 'milestone', threshold: 250000 },
  { id: '500k_keystrokes', name: 'Master Typist', description: 'Typed 500,000 keystrokes', icon: '👑', category: 'milestone', threshold: 500000 },
  { id: '1m_keystrokes', name: 'Legendary Typist', description: 'Typed 1,000,000 keystrokes', icon: '💎', category: 'milestone', threshold: 1000000 },

  // Streak achievements
  { id: 'first_streak', name: 'Day One', description: 'Started your typing journey', icon: '📅', category: 'streak', threshold: 1 },
  { id: 'week_streak', name: 'Week Warrior', description: '7-day typing streak', icon: '🗓️', category: 'streak', threshold: 7 },
  { id: 'month_streak', name: 'Month Master', description: '30-day typing streak', icon: '📆', category: 'streak', threshold: 30 },
  { id: 'hundred_streak', name: 'Century Club', description: '100-day typing streak', icon: '💯', category: 'streak', threshold: 100 },
  { id: 'year_streak', name: 'Annual Achiever', description: '365-day typing streak', icon: '🌟', category: 'streak', threshold: 365 },

  // Time-based achievements
  { id: 'early_bird', name: 'Early Bird', description: 'Typed before 6 AM', icon: '🌅', category: 'time', threshold: 1 },
  { id: 'night_owl', name: 'Night Owl', description: 'Typed after 11 PM', icon: '🌙', category: 'time', threshold: 1 },
  { id: 'weekend_warrior', name: 'Weekend Warrior', description: 'Active on weekends', icon: '🎮', category: 'time', threshold: 1 },
  { id: 'workday_hero', name: 'Workday Hero', description: 'Consistent weekday typing', icon: '💼', category: 'time', threshold: 5 },

  // Special achievements
  { id: 'speed_demon', name: 'Speed Demon', description: '1000+ keystrokes in an hour', icon: '🏎️', category: 'special', threshold: 1 },
  { id: 'marathon_typer', name: 'Marathon Typist', description: '10000+ keystrokes in a day', icon: '🏃', category: 'special', threshold: 1 },
  { id: 'consistency_king', name: 'Consistency King', description: 'Same hour for 7 days', icon: '⏰', category: 'special', threshold: 1 },
  { id: 'goal_crusher', name: 'Goal Crusher', description: 'Completed 10 challenges', icon: '🎯', category: 'challenge', threshold: 10 }
];

// Challenge generation
export function generateDailyChallenge(avgDaily: number, todayKeystrokes: number): Challenge {
  const challenges = [
    {
      id: 'daily_target',
      name: 'Daily Target',
      description: `Type ${Math.round(avgDaily * 1.2)} keystrokes today`,
      target: Math.round(avgDaily * 1.2),
      reward: '50 XP'
    },
    {
      id: 'beat_yesterday',
      name: 'Beat Yesterday',
      description: 'Type more than yesterday',
      target: todayKeystrokes + 1,
      reward: '30 XP'
    },
    {
      id: 'consistency_challenge',
      name: 'Consistency Challenge',
      description: 'Type for at least 3 different hours',
      target: 3,
      reward: '40 XP'
    },
    {
      id: 'morning_boost',
      name: 'Morning Boost',
      description: 'Type 500+ keystrokes before noon',
      target: 500,
      reward: '35 XP'
    }
  ];

  const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)];
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    ...randomChallenge,
    type: 'daily',
    progress: 0,
    startDate: today.toISOString().split('T')[0],
    endDate: tomorrow.toISOString().split('T')[0],
    completed: false
  };
}

export function generateWeeklyChallenge(avgWeekly: number): Challenge {
  const challenges = [
    {
      id: 'weekly_milestone',
      name: 'Weekly Milestone',
      description: `Type ${Math.round(avgWeekly * 1.3)} keystrokes this week`,
      target: Math.round(avgWeekly * 1.3),
      reward: '200 XP'
    },
    {
      id: 'perfect_week',
      name: 'Perfect Week',
      description: 'Type every day this week',
      target: 7,
      reward: '300 XP'
    },
    {
      id: 'weekend_warrior',
      name: 'Weekend Warrior',
      description: 'Type 5000+ keystrokes on weekend',
      target: 5000,
      reward: '150 XP'
    }
  ];

  const randomChallenge = challenges[Math.floor(Math.random() * challenges.length)];
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + (7 - today.getDay()));

  return {
    ...randomChallenge,
    type: 'weekly',
    progress: 0,
    startDate: today.toISOString().split('T')[0],
    endDate: weekEnd.toISOString().split('T')[0],
    completed: false
  };
}

// Achievement checking
export function checkAchievements(
  totalKeystrokes: number,
  streakDays: number,
  hourlyData: Record<string, number[]>,
  currentAchievements: Achievement[]
): Achievement[] {
  // Defensive programming: ensure parameters are valid
  if (typeof totalKeystrokes !== 'number' || totalKeystrokes < 0) {
    console.warn('Invalid totalKeystrokes for achievement check:', totalKeystrokes);
    return [];
  }

  if (typeof streakDays !== 'number' || streakDays < 0) {
    console.warn('Invalid streakDays for achievement check:', streakDays);
    return [];
  }

  // Ensure currentAchievements is always an array
  const safeAchievements = Array.isArray(currentAchievements) ? currentAchievements : [];
  const safeHourlyData = hourlyData && typeof hourlyData === 'object' ? hourlyData : {};

  const newAchievements: Achievement[] = [];
  const unlockedIds = safeAchievements.map(a => a.id);

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (unlockedIds.includes(def.id)) continue;

    let shouldUnlock = false;

    switch (def.category) {
      case 'milestone':
        shouldUnlock = totalKeystrokes >= def.threshold;
        break;

      case 'streak':
        shouldUnlock = streakDays >= def.threshold;
        break;

      case 'time':
        shouldUnlock = checkTimeBasedAchievement(def.id, safeHourlyData);
        break;

      case 'special':
        shouldUnlock = checkSpecialAchievement(def.id, totalKeystrokes, safeHourlyData);
        break;
    }

    if (shouldUnlock) {
      newAchievements.push({
        id: def.id,
        name: def.name,
        description: def.description,
        icon: def.icon,
        category: def.category,
        unlockedAt: new Date().toISOString()
      });
    }
  }

  return newAchievements;
}

function checkTimeBasedAchievement(achievementId: string, hourlyData: Record<string, number[]>): boolean {
  const today = new Date().toISOString().split('T')[0];
  const todayHours = hourlyData[today] || new Array(24).fill(0);

  switch (achievementId) {
    case 'early_bird':
      return todayHours.slice(4, 6).some(count => count > 0);

    case 'night_owl':
      return todayHours.slice(23).concat(todayHours.slice(0, 2)).some(count => count > 0);

    case 'weekend_warrior':
      const today_date = new Date();
      const isWeekend = today_date.getDay() === 0 || today_date.getDay() === 6;
      return isWeekend && todayHours.reduce((sum, count) => sum + count, 0) > 1000;

    case 'workday_hero':
      // Check if typed for 5 consecutive weekdays
      const last5Days = Object.keys(hourlyData).slice(-5);
      return last5Days.length === 5 && last5Days.every(date => {
        const day = new Date(date).getDay();
        return day >= 1 && day <= 5 && hourlyData[date].reduce((sum, count) => sum + count, 0) > 0;
      });

    default:
      return false;
  }
}

function checkSpecialAchievement(achievementId: string, totalKeystrokes: number, hourlyData: Record<string, number[]>): boolean {
  const today = new Date().toISOString().split('T')[0];
  const todayHours = hourlyData[today] || new Array(24).fill(0);

  switch (achievementId) {
    case 'speed_demon':
      return Math.max(...todayHours) >= 1000;

    case 'marathon_typer':
      return todayHours.reduce((sum, count) => sum + count, 0) >= 10000;

    case 'consistency_king':
      // Check if same hour has activity for 7 days
      const last7Days = Object.keys(hourlyData).slice(-7);
      if (last7Days.length < 7) return false;

      for (let hour = 0; hour < 24; hour++) {
        const hasActivityAllDays = last7Days.every(date =>
          hourlyData[date] && hourlyData[date][hour] > 0
        );
        if (hasActivityAllDays) return true;
      }
      return false;

    default:
      return false;
  }
}

// Level and XP system
export function calculateLevel(xp: number): number {
  // Level = sqrt(XP / 1000) + 1
  return Math.min(Math.floor(Math.sqrt(xp / 1000)) + 1, 100);
}

export function getXPForLevel(level: number): number {
  // XP = (level - 1)^2 * 1000
  return Math.pow(level - 1, 2) * 1000;
}

export function getXPToNextLevel(currentXP: number): { current: number; needed: number; level: number } {
  const currentLevel = calculateLevel(currentXP);
  const nextLevelXP = getXPForLevel(currentLevel + 1);
  const currentLevelXP = getXPForLevel(currentLevel);

  return {
    current: currentXP - currentLevelXP,
    needed: nextLevelXP - currentLevelXP,
    level: currentLevel
  };
}

// Personality type detection
export function determinePersonalityType(hourlyData: Record<string, number[]>): string {
  const allHours = Object.values(hourlyData).flat();
  if (allHours.length === 0) return '';

  // Calculate hourly averages
  const hourAverages = new Array(24).fill(0);
  const dayCount = Object.keys(hourlyData).length || 1;

  Object.values(hourlyData).forEach(dayHours => {
    dayHours.forEach((count, hour) => {
      hourAverages[hour] += count;
    });
  });

  hourAverages.forEach((total, hour) => {
    hourAverages[hour] = total / dayCount;
  });

  // Find peak activity periods
  const morningActivity = hourAverages.slice(6, 12).reduce((sum, count) => sum + count, 0);
  const afternoonActivity = hourAverages.slice(12, 18).reduce((sum, count) => sum + count, 0);
  const eveningActivity = hourAverages.slice(18, 23).reduce((sum, count) => sum + count, 0);
  const nightActivity = hourAverages.slice(23).concat(hourAverages.slice(0, 6)).reduce((sum, count) => sum + count, 0);

  const maxActivity = Math.max(morningActivity, afternoonActivity, eveningActivity, nightActivity);

  if (maxActivity === morningActivity) {
    return 'Morning Warrior ☀️';
  } else if (maxActivity === afternoonActivity) {
    return 'Afternoon Achiever 🌤️';
  } else if (maxActivity === eveningActivity) {
    return 'Evening Expert 🌅';
  } else {
    return 'Night Owl 🌙';
  }
}

// Goal management
export function createGoal(
  name: string,
  description: string,
  target: number,
  type: 'daily' | 'weekly' | 'monthly' | 'custom',
  targetDate?: string
): Goal {
  return {
    id: `goal_${Date.now()}`,
    name,
    description,
    target,
    current: 0,
    type,
    createdDate: new Date().toISOString(),
    targetDate,
    completed: false
  };
}

export function updateGoalProgress(goal: Goal, currentProgress: number): Goal {
  const completed = currentProgress >= goal.target;
  return {
    ...goal,
    current: currentProgress,
    completed
  };
}

// Progress calculations
export function getDailyProgress(todayKeystrokes: number, dailyGoal: number): number {
  return Math.min((todayKeystrokes / dailyGoal) * 100, 100);
}

export function getWeeklyProgress(weekKeystrokes: number, weeklyGoal: number): number {
  return Math.min((weekKeystrokes / weeklyGoal) * 100, 100);
}
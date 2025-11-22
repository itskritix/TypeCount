// Analytics utilities for TypeCount

export interface DayData {
  date: string;
  count: number;
  hours: number[];
}

export interface WeekData {
  weekStart: string;
  weekEnd: string;
  total: number;
  dailyAverage: number;
  days: DayData[];
}

export interface MonthData {
  month: string;
  year: number;
  total: number;
  dailyAverage: number;
  topDay: { date: string; count: number };
  days: DayData[];
}

export interface YearData {
  year: number;
  total: number;
  monthlyAverage: number;
  topMonth: { month: string; count: number };
  months: { month: string; count: number }[];
}

export interface ProductivityInsights {
  peakHour: number;
  peakHourAverage: number;
  mostProductiveDay: string;
  averageDaily: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  currentStreak: number;
  longestStreak: number;
}

// Get data for the last N days (optimized)
export function getLastNDays(
  dailyData: Record<string, number>,
  hourlyData: Record<string, number[]>,
  days: number
): DayData[] {
  const result: DayData[] = new Array(days);
  const today = new Date();
  const todayTime = today.getTime();

  // Pre-calculate all dates to avoid repeated operations
  for (let i = 0; i < days; i++) {
    const dateTime = todayTime - (i * 24 * 60 * 60 * 1000);
    const date = new Date(dateTime);
    const dateStr = date.toISOString().split('T')[0];

    result[days - 1 - i] = {
      date: dateStr,
      count: dailyData[dateStr] || 0,
      hours: hourlyData[dateStr] || new Array(24).fill(0)
    };
  }

  return result;
}

// Get weekly analytics
export function getWeeklyAnalytics(
  dailyData: Record<string, number>,
  hourlyData: Record<string, number[]>
): WeekData {
  const days = getLastNDays(dailyData, hourlyData, 7);
  const total = days.reduce((sum, day) => sum + day.count, 0);

  return {
    weekStart: days[0].date,
    weekEnd: days[days.length - 1].date,
    total,
    dailyAverage: Math.round(total / 7),
    days
  };
}

// Get monthly analytics
export function getMonthlyAnalytics(
  dailyData: Record<string, number>,
  hourlyData: Record<string, number[]>
): MonthData {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = getLastNDays(dailyData, hourlyData, daysInMonth);
  const total = days.reduce((sum, day) => sum + day.count, 0);

  const topDay = days.reduce((max, day) =>
    day.count > max.count ? day : max,
    { date: '', count: 0, hours: new Array(24).fill(0) } as DayData
  );

  return {
    month: today.toLocaleString('default', { month: 'long' }),
    year,
    total,
    dailyAverage: Math.round(total / daysInMonth),
    topDay,
    days
  };
}

// Get yearly analytics
export function getYearlyAnalytics(
  dailyData: Record<string, number>
): YearData {
  const today = new Date();
  const currentYear = today.getFullYear();
  const months: { month: string; count: number }[] = [];

  for (let i = 0; i < 12; i++) {
    const monthDate = new Date(currentYear, i, 1);
    const monthName = monthDate.toLocaleString('default', { month: 'long' });
    let monthTotal = 0;

    // Calculate total for this month
    Object.entries(dailyData).forEach(([date, count]) => {
      const d = new Date(date);
      if (d.getFullYear() === currentYear && d.getMonth() === i) {
        monthTotal += count;
      }
    });

    months.push({ month: monthName, count: monthTotal });
  }

  const total = months.reduce((sum, m) => sum + m.count, 0);
  const topMonth = months.reduce((max, m) =>
    m.count > max.count ? m : max,
    { month: '', count: 0 }
  );

  return {
    year: currentYear,
    total,
    monthlyAverage: Math.round(total / 12),
    topMonth,
    months
  };
}

// Get productivity insights
export function getProductivityInsights(
  dailyData: Record<string, number>,
  hourlyData: Record<string, number[]>,
  currentStreak: number
): ProductivityInsights {
  // Calculate peak hour (optimized)
  const hourTotals = new Array(24).fill(0);
  const hourlyValues = Object.values(hourlyData);
  let maxHourTotal = 0;
  let peakHour = 0;

  // Single pass to calculate totals and find peak
  for (const hours of hourlyValues) {
    for (let hour = 0; hour < 24; hour++) {
      hourTotals[hour] += hours[hour] || 0;
      if (hourTotals[hour] > maxHourTotal) {
        maxHourTotal = hourTotals[hour];
        peakHour = hour;
      }
    }
  }

  const daysWithData = hourlyValues.length || 1;
  const peakHourAverage = Math.round(maxHourTotal / daysWithData);

  // Find most productive day
  const mostProductiveEntry = Object.entries(dailyData).reduce(
    (max, [date, count]) => count > max[1] ? [date, count] : max,
    ['', 0]
  );

  // Calculate average daily
  const totalDays = Object.keys(dailyData).length || 1;
  const totalKeystrokes = Object.values(dailyData).reduce((sum, count) => sum + count, 0);
  const averageDaily = Math.round(totalKeystrokes / totalDays);

  // Determine trend (comparing last 7 days to previous 7 days)
  const last7Days = getLastNDays(dailyData, hourlyData, 7);
  const prev7Days = getLastNDays(dailyData, hourlyData, 14).slice(0, 7);

  const last7Total = last7Days.reduce((sum, day) => sum + day.count, 0);
  const prev7Total = prev7Days.reduce((sum, day) => sum + day.count, 0);

  let trend: 'increasing' | 'decreasing' | 'stable';
  if (last7Total > prev7Total * 1.1) {
    trend = 'increasing';
  } else if (last7Total < prev7Total * 0.9) {
    trend = 'decreasing';
  } else {
    trend = 'stable';
  }

  // Calculate longest streak
  let longestStreak = currentStreak;
  let tempStreak = 0;
  const sortedDates = Object.keys(dailyData).sort();

  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0 || isConsecutiveDays(sortedDates[i - 1], sortedDates[i])) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }

  return {
    peakHour,
    peakHourAverage,
    mostProductiveDay: mostProductiveEntry[0],
    averageDaily,
    trend,
    currentStreak,
    longestStreak
  };
}

// Helper function to check if two dates are consecutive
function isConsecutiveDays(date1: string, date2: string): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

// Export data to CSV
export function exportToCSV(
  dailyData: Record<string, number>,
  hourlyData: Record<string, number[]>
): string {
  try {
    const headers = ['Date', 'Total Keystrokes', ...Array.from({ length: 24 }, (_, i) => `Hour ${i}`)];
    const rows: string[] = [headers.join(',')];

    const sortedDates = Object.keys(dailyData || {}).sort();
    sortedDates.forEach(date => {
      const hourData = hourlyData[date] || new Array(24).fill(0);
      const row = [date, (dailyData[date] || 0).toString(), ...hourData.map(h => h.toString())];
      rows.push(row.join(','));
    });

    return rows.join('\n');
  } catch (error) {
    console.error('Error creating CSV:', error);
    throw new Error('Failed to export CSV data');
  }
}

// Export data to JSON
export function exportToJSON(data: {
  totalKeystrokes: number;
  dailyKeystrokes: Record<string, number>;
  hourlyKeystrokes: Record<string, number[]>;
  achievements: string[];
  streakDays: number;
  firstUsedDate: string;
}): string {
  try {
    // Validate data before export
    const exportData = {
      totalKeystrokes: data.totalKeystrokes || 0,
      dailyKeystrokes: data.dailyKeystrokes || {},
      hourlyKeystrokes: data.hourlyKeystrokes || {},
      achievements: data.achievements || [],
      streakDays: data.streakDays || 0,
      firstUsedDate: data.firstUsedDate || new Date().toISOString(),
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error('Error creating JSON:', error);
    throw new Error('Failed to export JSON data');
  }
}
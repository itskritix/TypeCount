// Performance optimization utilities and monitoring for TypeCount

import { performance } from 'perf_hooks';

interface PerformanceMetrics {
  keystrokesPerSecond: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  lastMeasurement: number;
}

interface DataCleanupConfig {
  maxDailyRecords: number; // Keep last N days of daily data
  maxHourlyRecords: number; // Keep last N days of hourly data
  cleanupInterval: number; // How often to run cleanup (ms)
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private keystrokeBuffer: number[] = [];
  private lastKeystrokeTime = performance.now();
  private lastCpuUsage = process.cpuUsage();
  private cleanupConfig: DataCleanupConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(cleanupConfig?: Partial<DataCleanupConfig>) {
    this.cleanupConfig = {
      maxDailyRecords: 365, // Keep 1 year of daily data
      maxHourlyRecords: 30, // Keep 30 days of hourly data
      cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
      ...cleanupConfig
    };

    this.metrics = {
      keystrokesPerSecond: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      lastMeasurement: performance.now()
    };

    this.startMonitoring();
  }

  // Record keystroke performance
  recordKeystroke(): void {
    const now = performance.now();
    this.keystrokeBuffer.push(now);

    // Keep only last 60 seconds of keystrokes for KPS calculation
    const cutoff = now - 60000; // 60 seconds ago
    this.keystrokeBuffer = this.keystrokeBuffer.filter(time => time > cutoff);

    this.lastKeystrokeTime = now;
  }

  // Calculate keystrokes per second
  getKeystrokesPerSecond(): number {
    const now = performance.now();
    const cutoff = now - 1000; // Last second
    const recentKeystrokes = this.keystrokeBuffer.filter(time => time > cutoff);
    return recentKeystrokes.length;
  }

  // Get current performance metrics
  getMetrics(): PerformanceMetrics {
    return {
      keystrokesPerSecond: this.getKeystrokesPerSecond(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(this.lastCpuUsage),
      uptime: process.uptime(),
      lastMeasurement: performance.now()
    };
  }

  // Start continuous monitoring
  private startMonitoring(): void {
    // Update metrics every 5 seconds
    setInterval(() => {
      this.metrics = this.getMetrics();
      this.lastCpuUsage = process.cpuUsage();
    }, 5000);

    // Start data cleanup
    this.startDataCleanup();
  }

  // Start automatic data cleanup to prevent memory leaks
  private startDataCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.performDataCleanup();
    }, this.cleanupConfig.cleanupInterval);
  }

  // Clean up old data to prevent memory leaks
  public performDataCleanup(): { dailyRemoved: number; hourlyRemoved: number } {
    const Store = require('electron-store');
    const store = new Store();

    // Clean up daily keystroke data
    const dailyData = store.get('dailyKeystrokes') || {};
    const dailyDates = Object.keys(dailyData).sort();
    let dailyRemoved = 0;

    if (dailyDates.length > this.cleanupConfig.maxDailyRecords) {
      const toRemove = dailyDates.slice(0, dailyDates.length - this.cleanupConfig.maxDailyRecords);
      const cleanedDaily = { ...dailyData };

      for (const date of toRemove) {
        delete cleanedDaily[date];
        dailyRemoved++;
      }

      store.set('dailyKeystrokes', cleanedDaily);
    }

    // Clean up hourly keystroke data
    const hourlyData = store.get('hourlyKeystrokes') || {};
    const hourlyDates = Object.keys(hourlyData).sort();
    let hourlyRemoved = 0;

    if (hourlyDates.length > this.cleanupConfig.maxHourlyRecords) {
      const toRemove = hourlyDates.slice(0, hourlyDates.length - this.cleanupConfig.maxHourlyRecords);
      const cleanedHourly = { ...hourlyData };

      for (const date of toRemove) {
        delete cleanedHourly[date];
        hourlyRemoved++;
      }

      store.set('hourlyKeystrokes', cleanedHourly);
    }

    console.log(`Data cleanup completed: ${dailyRemoved} daily records, ${hourlyRemoved} hourly records removed`);
    return { dailyRemoved, hourlyRemoved };
  }

  // Get memory usage warning
  getMemoryWarning(): string | null {
    const memUsage = this.metrics.memoryUsage;
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;

    if (heapUsedMB > 100) { // Warning if using more than 100MB
      return `High memory usage: ${heapUsedMB.toFixed(1)}MB used of ${heapTotalMB.toFixed(1)}MB total`;
    }

    if (memUsage.external > 50 * 1024 * 1024) { // Warning if external memory > 50MB
      return `High external memory usage: ${(memUsage.external / 1024 / 1024).toFixed(1)}MB`;
    }

    return null;
  }

  // Force garbage collection (if available)
  forceGarbageCollection(): boolean {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  // Get performance report
  getPerformanceReport(): object {
    const metrics = this.getMetrics();
    const memoryWarning = this.getMemoryWarning();
    const heapUsedMB = metrics.memoryUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = metrics.memoryUsage.heapTotal / 1024 / 1024;

    return {
      performance: {
        keystrokesPerSecond: metrics.keystrokesPerSecond,
        memoryUsageMB: {
          heapUsed: parseFloat(heapUsedMB.toFixed(2)),
          heapTotal: parseFloat(heapTotalMB.toFixed(2)),
          external: parseFloat((metrics.memoryUsage.external / 1024 / 1024).toFixed(2)),
          rss: parseFloat((metrics.memoryUsage.rss / 1024 / 1024).toFixed(2))
        },
        cpuUsage: {
          user: metrics.cpuUsage.user,
          system: metrics.cpuUsage.system
        },
        uptime: parseFloat((metrics.uptime / 3600).toFixed(2)) // hours
      },
      warnings: memoryWarning ? [memoryWarning] : [],
      recommendations: this.getPerformanceRecommendations()
    };
  }

  // Get performance optimization recommendations
  private getPerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    const metrics = this.getMetrics();
    const heapUsedMB = metrics.memoryUsage.heapUsed / 1024 / 1024;

    if (heapUsedMB > 100) {
      recommendations.push('Consider reducing data retention or increasing cleanup frequency');
    }

    if (metrics.keystrokesPerSecond > 20) {
      recommendations.push('Very high keystroke rate detected - consider optimizing update frequency');
    }

    if (metrics.cpuUsage.user > 1000000) { // 1 second of CPU time
      recommendations.push('High CPU usage detected - check for performance bottlenecks');
    }

    return recommendations;
  }

  // Stop monitoring and cleanup
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// Debounce utility for reducing function call frequency
export class Debouncer {
  private timeouts = new Map<string, NodeJS.Timeout>();

  debounce<T extends any[]>(
    key: string,
    fn: (...args: T) => void,
    delay: number
  ): (...args: T) => void {
    return (...args: T) => {
      const existingTimeout = this.timeouts.get(key);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeout = setTimeout(() => {
        fn(...args);
        this.timeouts.delete(key);
      }, delay);

      this.timeouts.set(key, timeout);
    };
  }

  // Clear all pending debounced calls
  clear(): void {
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
  }
}

// Batch store operations to reduce I/O
export class BatchedStore {
  private store: any;
  private pendingUpdates = new Map<string, any>();
  private flushTimeout: NodeJS.Timeout | null = null;
  private flushDelay: number;

  constructor(store: any, flushDelay = 1000) {
    this.store = store;
    this.flushDelay = flushDelay;
  }

  // Queue a store update
  set(key: string, value: any): void {
    this.pendingUpdates.set(key, value);
    this.scheduleFlush();
  }

  // Get a value (immediate)
  get(key: string): any {
    // Check pending updates first
    if (this.pendingUpdates.has(key)) {
      return this.pendingUpdates.get(key);
    }
    return this.store.get(key);
  }

  // Schedule a flush of pending updates
  private scheduleFlush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }

    this.flushTimeout = setTimeout(() => {
      this.flush();
    }, this.flushDelay);
  }

  // Immediately flush pending updates
  flush(): void {
    if (this.pendingUpdates.size === 0) return;

    // Batch all updates into a single operation
    const updates: Record<string, any> = {};
    for (const [key, value] of this.pendingUpdates) {
      updates[key] = value;
    }

    // Apply all updates at once
    for (const [key, value] of Object.entries(updates)) {
      this.store.set(key, value);
    }

    this.pendingUpdates.clear();

    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    console.log(`Batched ${Object.keys(updates).length} store updates`);
  }

  // Force immediate update (for critical data)
  setImmediate(key: string, value: any): void {
    this.pendingUpdates.set(key, value);
    this.flush();
  }
}

// Throttle utility for limiting function call frequency
export class Throttler {
  private lastCalls = new Map<string, number>();

  throttle<T extends any[]>(
    key: string,
    fn: (...args: T) => void,
    interval: number
  ): (...args: T) => void {
    return (...args: T) => {
      const now = Date.now();
      const lastCall = this.lastCalls.get(key) || 0;

      if (now - lastCall >= interval) {
        fn(...args);
        this.lastCalls.set(key, now);
      }
    };
  }

  // Clear throttle history
  clear(): void {
    this.lastCalls.clear();
  }
}

// Global instances
export const performanceMonitor = new PerformanceMonitor();
export const debouncer = new Debouncer();
export const throttler = new Throttler();
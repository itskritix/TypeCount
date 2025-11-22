// Crash reporting and analytics system for TypeCount

import { app, dialog } from 'electron';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface CrashReport {
  id: string;
  timestamp: string;
  version: string;
  platform: string;
  arch: string;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  systemInfo: {
    platform: string;
    version: string;
    arch: string;
    memory: number;
    uptime: number;
  };
  appInfo: {
    version: string;
    uptime: number;
    keystrokeCount?: number;
    lastOperation?: string;
  };
  performance?: {
    memory: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
  userAgent?: string;
  additionalData?: Record<string, any>;
}

interface AnalyticsEvent {
  id: string;
  timestamp: string;
  type: 'app_start' | 'app_quit' | 'feature_used' | 'error' | 'performance' | 'achievement' | 'custom';
  category: string;
  action: string;
  value?: number;
  properties?: Record<string, any>;
  sessionId: string;
}

export class CrashReportingService {
  private sessionId: string;
  private appStartTime: number;
  private crashReportsDir: string;
  private analyticsDir: string;
  private maxReports = 50; // Keep last 50 crash reports
  private maxAnalyticsEvents = 1000; // Keep last 1000 analytics events
  private enabled = true;
  private currentKeystrokeCount = 0;
  private lastOperation = '';

  constructor() {
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.appStartTime = performance.now();

    const userDataPath = app.getPath('userData');
    this.crashReportsDir = path.join(userDataPath, 'crash-reports');
    this.analyticsDir = path.join(userDataPath, 'analytics');

    this.ensureDirectories();
    this.setupErrorHandlers();
    this.trackEvent('app_start', 'startup', 'application_started');
  }

  // Ensure required directories exist
  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.crashReportsDir)) {
        fs.mkdirSync(this.crashReportsDir, { recursive: true });
      }
      if (!fs.existsSync(this.analyticsDir)) {
        fs.mkdirSync(this.analyticsDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create crash reporting directories:', error);
    }
  }

  // Set up global error handlers
  private setupErrorHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.reportCrash(error, 'uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.reportCrash(error, 'unhandledRejection');
    });

    // Handle Electron renderer process crashes
    app.on('render-process-gone', (event, webContents, details) => {
      const error = new Error(`Renderer process crashed: ${details.reason}`);
      this.reportCrash(error, 'renderer_crash', {
        reason: details.reason,
        exitCode: details.exitCode
      });
    });

    // Handle child process crashes
    app.on('child-process-gone', (event, details) => {
      const error = new Error(`Child process crashed: ${details.type}`);
      this.reportCrash(error, 'child_process_crash', {
        type: details.type,
        reason: details.reason,
        exitCode: details.exitCode
      });
    });
  }

  // Update keystroke count for crash reporting context
  updateKeystrokeCount(count: number): void {
    this.currentKeystrokeCount = count;
  }

  // Update last operation for crash reporting context
  updateLastOperation(operation: string): void {
    this.lastOperation = operation;
  }

  // Report a crash
  async reportCrash(error: Error, type: string, additionalData?: Record<string, any>): Promise<string> {
    try {
      const crashId = `crash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const crashReport: CrashReport = {
        id: crashId,
        timestamp: new Date().toISOString(),
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        systemInfo: {
          platform: os.platform(),
          version: os.release(),
          arch: os.arch(),
          memory: os.totalmem(),
          uptime: os.uptime()
        },
        appInfo: {
          version: app.getVersion(),
          uptime: performance.now() - this.appStartTime,
          keystrokeCount: this.currentKeystrokeCount,
          lastOperation: this.lastOperation
        },
        performance: {
          memory: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        },
        additionalData
      };

      // Save crash report to file
      const crashFile = path.join(this.crashReportsDir, `${crashId}.json`);
      await fs.promises.writeFile(crashFile, JSON.stringify(crashReport, null, 2), 'utf8');

      // Log crash
      console.error(`Crash reported: ${crashId}`, crashReport);

      // Track crash as analytics event
      this.trackEvent('error', 'crash', type, 1, {
        errorName: error.name,
        errorMessage: error.message,
        platform: process.platform
      });

      // Show user notification for critical crashes
      if (type === 'uncaughtException' || type === 'renderer_crash') {
        await this.showCrashDialog(crashReport);
      }

      // Clean up old crash reports
      this.cleanupOldReports();

      return crashId;
    } catch (reportingError) {
      console.error('Failed to report crash:', reportingError);
      return 'failed-to-report';
    }
  }

  // Show crash dialog to user
  private async showCrashDialog(crashReport: CrashReport): Promise<void> {
    if (!this.enabled) return;

    try {
      const result = await dialog.showMessageBox({
        type: 'error',
        title: 'TypeCount Encountered an Error',
        message: 'TypeCount has encountered an unexpected error and needs to restart.',
        detail: `Error: ${crashReport.error.message}\n\nA crash report has been saved for debugging. You can help improve TypeCount by sharing this information with the developers.`,
        buttons: ['Restart', 'View Report', 'Quit'],
        defaultId: 0,
        cancelId: 2
      });

      switch (result.response) {
        case 0: // Restart
          app.relaunch();
          app.quit();
          break;
        case 1: // View Report
          await this.showCrashReportDialog(crashReport);
          break;
        case 2: // Quit
          app.quit();
          break;
      }
    } catch (error) {
      console.error('Failed to show crash dialog:', error);
    }
  }

  // Show detailed crash report dialog
  private async showCrashReportDialog(crashReport: CrashReport): Promise<void> {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Crash Report Details',
      message: `Crash ID: ${crashReport.id}`,
      detail: JSON.stringify(crashReport, null, 2),
      buttons: ['OK']
    });
  }

  // Track analytics event
  trackEvent(
    type: AnalyticsEvent['type'],
    category: string,
    action: string,
    value?: number,
    properties?: Record<string, any>
  ): void {
    if (!this.enabled) return;

    try {
      const event: AnalyticsEvent = {
        id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        type,
        category,
        action,
        value,
        properties: {
          platform: process.platform,
          version: app.getVersion(),
          sessionId: this.sessionId,
          ...properties
        },
        sessionId: this.sessionId
      };

      // Save event to daily analytics file
      const today = new Date().toISOString().split('T')[0];
      const analyticsFile = path.join(this.analyticsDir, `${today}.jsonl`);

      // Append event as JSON line
      const eventLine = JSON.stringify(event) + '\n';
      fs.appendFileSync(analyticsFile, eventLine, 'utf8');

      // Clean up old analytics files
      this.cleanupOldAnalytics();

    } catch (error) {
      console.error('Failed to track analytics event:', error);
    }
  }

  // Track performance metrics
  trackPerformance(metrics: {
    keystrokesPerSecond?: number;
    memoryUsageMB?: number;
    cpuUsage?: number;
    responseTime?: number;
  }): void {
    this.trackEvent('performance', 'metrics', 'performance_measurement', undefined, metrics);
  }

  // Track feature usage
  trackFeatureUsage(feature: string, action: string, properties?: Record<string, any>): void {
    this.trackEvent('feature_used', feature, action, undefined, properties);
  }

  // Track achievement unlock
  trackAchievement(achievementId: string, achievementName: string): void {
    this.trackEvent('achievement', 'unlocked', achievementId, undefined, {
      achievementName,
      keystrokeCount: this.currentKeystrokeCount
    });
  }

  // Clean up old crash reports
  private cleanupOldReports(): void {
    try {
      const files = fs.readdirSync(this.crashReportsDir)
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.crashReportsDir, file),
          mtime: fs.statSync(path.join(this.crashReportsDir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Remove old reports if we exceed the limit
      if (files.length > this.maxReports) {
        const toDelete = files.slice(this.maxReports);
        for (const file of toDelete) {
          fs.unlinkSync(file.path);
        }
        console.log(`Cleaned up ${toDelete.length} old crash reports`);
      }
    } catch (error) {
      console.error('Failed to cleanup old crash reports:', error);
    }
  }

  // Clean up old analytics files
  private cleanupOldAnalytics(): void {
    try {
      const files = fs.readdirSync(this.analyticsDir)
        .filter(file => file.endsWith('.jsonl'))
        .map(file => ({
          name: file,
          path: path.join(this.analyticsDir, file),
          mtime: fs.statSync(path.join(this.analyticsDir, file)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Keep analytics for last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const toDelete = files.filter(file => file.mtime < thirtyDaysAgo);
      for (const file of toDelete) {
        fs.unlinkSync(file.path);
      }

      if (toDelete.length > 0) {
        console.log(`Cleaned up ${toDelete.length} old analytics files`);
      }
    } catch (error) {
      console.error('Failed to cleanup old analytics files:', error);
    }
  }

  // Get crash reports summary
  getCrashReportsSummary(): { totalReports: number; recentReports: CrashReport[] } {
    try {
      const files = fs.readdirSync(this.crashReportsDir)
        .filter(file => file.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 10); // Get last 10 reports

      const recentReports: CrashReport[] = files.map(file => {
        const filePath = path.join(this.crashReportsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      });

      return {
        totalReports: fs.readdirSync(this.crashReportsDir).filter(f => f.endsWith('.json')).length,
        recentReports
      };
    } catch (error) {
      console.error('Failed to get crash reports summary:', error);
      return { totalReports: 0, recentReports: [] };
    }
  }

  // Get analytics summary
  getAnalyticsSummary(): { totalEvents: number; todayEvents: number; errorRate: number } {
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayFile = path.join(this.analyticsDir, `${today}.jsonl`);

      let todayEvents = 0;
      let errorEvents = 0;

      if (fs.existsSync(todayFile)) {
        const content = fs.readFileSync(todayFile, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);
        todayEvents = lines.length;

        errorEvents = lines.filter(line => {
          try {
            const event = JSON.parse(line);
            return event.type === 'error';
          } catch {
            return false;
          }
        }).length;
      }

      // Calculate total events from all files
      const analyticsFiles = fs.readdirSync(this.analyticsDir)
        .filter(file => file.endsWith('.jsonl'));

      let totalEvents = 0;
      for (const file of analyticsFiles) {
        const filePath = path.join(this.analyticsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);
        totalEvents += lines.length;
      }

      const errorRate = todayEvents > 0 ? (errorEvents / todayEvents) * 100 : 0;

      return { totalEvents, todayEvents, errorRate };
    } catch (error) {
      console.error('Failed to get analytics summary:', error);
      return { totalEvents: 0, todayEvents: 0, errorRate: 0 };
    }
  }

  // Enable/disable crash reporting
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`Crash reporting ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Track app shutdown
  trackAppShutdown(): void {
    const uptime = performance.now() - this.appStartTime;
    this.trackEvent('app_quit', 'shutdown', 'application_closed', uptime, {
      keystrokeCount: this.currentKeystrokeCount,
      sessionDuration: uptime
    });
  }

  // Manual error reporting for handled errors
  reportError(error: Error, context?: string, additionalData?: Record<string, any>): void {
    this.trackEvent('error', 'handled_error', context || 'unknown', undefined, {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      ...additionalData
    });
  }

  // Test crash reporting (for debugging)
  testCrashReporting(): Promise<string> {
    const testError = new Error('Test crash report');
    return this.reportCrash(testError, 'test_crash', { test: true });
  }
}

// Global instance
export const crashReporting = new CrashReportingService();

// Export types for use in other modules
export type { CrashReport, AnalyticsEvent };
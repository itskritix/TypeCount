// Beta testing framework for TypeCount

import { app, BrowserWindow, dialog, shell } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface BetaTester {
  id: string;
  email: string;
  name: string;
  platform: string;
  version: string;
  registeredAt: string;
  lastActiveAt: string;
  feedbackCount: number;
  testingLevel: 'basic' | 'advanced' | 'developer';
  preferences: {
    bugReports: boolean;
    featureFeedback: boolean;
    performanceTesting: boolean;
    usabilityTesting: boolean;
  };
}

interface FeedbackItem {
  id: string;
  testerId: string;
  type: 'bug' | 'feature_request' | 'improvement' | 'praise' | 'question';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  steps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  timestamp: string;
  platform: string;
  version: string;
  systemInfo: {
    os: string;
    version: string;
    arch: string;
    memory: number;
  };
  attachments?: {
    logs: boolean;
    screenshots: string[];
    performanceData?: any;
  };
  status: 'open' | 'investigating' | 'fixed' | 'wont_fix' | 'duplicate';
  response?: string;
  respondedAt?: string;
}

interface BetaMetrics {
  totalTesters: number;
  activeTesters: number; // Active in last 7 days
  feedbackItems: number;
  criticalIssues: number;
  fixedIssues: number;
  averageSessionLength: number;
  crashRate: number;
  satisfactionScore: number; // 1-10
  platformDistribution: Record<string, number>;
  versionDistribution: Record<string, number>;
}

interface BetaConfig {
  enabled: boolean;
  maxTesters: number;
  feedbackEndpoint?: string;
  automaticReporting: boolean;
  collectAnonymousMetrics: boolean;
  sendCrashReports: boolean;
  feedbackPromptInterval: number; // days
  lastFeedbackPrompt?: string;
}

export class BetaTestingService {
  private store: Store<{ betaConfig: BetaConfig; betaTester: BetaTester | null }>;
  private feedbackStore: Store<{ feedback: FeedbackItem[] }>;
  private isRegistered = false;
  private currentTester: BetaTester | null = null;

  constructor() {
    this.store = new Store({
      name: 'beta-config',
      defaults: {
        betaConfig: {
          enabled: false,
          maxTesters: 100,
          automaticReporting: false,
          collectAnonymousMetrics: true,
          sendCrashReports: true,
          feedbackPromptInterval: 7 // days
        },
        betaTester: null
      }
    });

    this.feedbackStore = new Store({
      name: 'beta-feedback',
      defaults: {
        feedback: []
      }
    });

    this.loadBetaTester();
  }

  // Check if beta testing is enabled
  isBetaTestingEnabled(): boolean {
    return this.store.get('betaConfig').enabled;
  }

  // Check if user is registered as beta tester
  isBetaTester(): boolean {
    return this.isRegistered && this.currentTester !== null;
  }

  // Get current beta tester info
  getCurrentTester(): BetaTester | null {
    return this.currentTester;
  }

  // Load beta tester from storage
  private loadBetaTester(): void {
    const tester = this.store.get('betaTester');
    if (tester) {
      this.currentTester = tester;
      this.isRegistered = true;
      this.updateLastActive();
    }
  }

  // Register as beta tester
  async registerBetaTester(email: string, name: string, testingLevel: BetaTester['testingLevel']): Promise<boolean> {
    try {
      const config = this.store.get('betaConfig');

      if (!config.enabled) {
        throw new Error('Beta testing is not currently active');
      }

      // Generate unique tester ID
      const testerId = crypto.randomUUID();

      const tester: BetaTester = {
        id: testerId,
        email,
        name,
        platform: process.platform,
        version: app.getVersion(),
        registeredAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        feedbackCount: 0,
        testingLevel,
        preferences: {
          bugReports: true,
          featureFeedback: true,
          performanceTesting: testingLevel === 'advanced' || testingLevel === 'developer',
          usabilityTesting: true
        }
      };

      // Save to storage
      this.store.set('betaTester', tester);
      this.currentTester = tester;
      this.isRegistered = true;

      // Show welcome message
      await this.showWelcomeMessage();

      console.log(`Beta tester registered: ${name} (${email})`);
      return true;

    } catch (error) {
      console.error('Failed to register beta tester:', error);
      return false;
    }
  }

  // Unregister as beta tester
  async unregisterBetaTester(): Promise<void> {
    if (!this.currentTester) return;

    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Unregister Beta Tester',
      message: 'Are you sure you want to stop beta testing?',
      detail: 'Your feedback history will be preserved, but you will no longer receive beta updates or be prompted for feedback.',
      buttons: ['Keep Beta Testing', 'Unregister'],
      defaultId: 0,
      cancelId: 0
    });

    if (result.response === 1) {
      this.store.set('betaTester', null);
      this.currentTester = null;
      this.isRegistered = false;

      await dialog.showMessageBox({
        type: 'info',
        title: 'Beta Testing Disabled',
        message: 'You have been unregistered from beta testing.',
        detail: 'Thank you for your participation! You can re-register anytime in Settings.',
        buttons: ['OK']
      });
    }
  }

  // Update last active timestamp
  private updateLastActive(): void {
    if (this.currentTester) {
      this.currentTester.lastActiveAt = new Date().toISOString();
      this.store.set('betaTester', this.currentTester);
    }
  }

  // Show feedback form
  async showFeedbackForm(type?: FeedbackItem['type']): Promise<void> {
    if (!this.isBetaTester()) {
      await this.promptBetaRegistration();
      return;
    }

    const feedbackWindow = new BrowserWindow({
      width: 800,
      height: 700,
      resizable: true,
      minimizable: false,
      maximizable: false,
      center: true,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: require.resolve('./beta-feedback-preload.js')
      },
      title: 'TypeCount Beta Feedback',
      titleBarStyle: 'default'
    });

    // Load feedback form HTML
    feedbackWindow.loadURL('data:text/html,' + this.generateFeedbackFormHTML(type));

    feedbackWindow.on('closed', () => {
      // Form was closed without submitting
    });

    // Handle form submission
    feedbackWindow.webContents.on('ipc-message', async (event, channel, data) => {
      if (channel === 'submit-feedback') {
        await this.submitFeedback(data);
        feedbackWindow.close();
      }
    });
  }

  // Submit feedback
  async submitFeedback(feedbackData: any): Promise<string> {
    if (!this.currentTester) {
      throw new Error('Not registered as beta tester');
    }

    const feedbackId = crypto.randomUUID();

    const feedback: FeedbackItem = {
      id: feedbackId,
      testerId: this.currentTester.id,
      type: feedbackData.type,
      priority: feedbackData.priority || 'medium',
      title: feedbackData.title,
      description: feedbackData.description,
      steps: feedbackData.steps || [],
      expectedBehavior: feedbackData.expectedBehavior,
      actualBehavior: feedbackData.actualBehavior,
      timestamp: new Date().toISOString(),
      platform: process.platform,
      version: app.getVersion(),
      systemInfo: {
        os: process.platform,
        version: process.getSystemVersion(),
        arch: process.arch,
        memory: require('os').totalmem()
      },
      attachments: {
        logs: feedbackData.includeLogs || false,
        screenshots: feedbackData.screenshots || [],
        performanceData: feedbackData.includePerformanceData ? this.collectPerformanceData() : undefined
      },
      status: 'open'
    };

    // Save feedback locally
    const existingFeedback = this.feedbackStore.get('feedback');
    existingFeedback.push(feedback);
    this.feedbackStore.set('feedback', existingFeedback);

    // Update tester feedback count
    this.currentTester.feedbackCount++;
    this.store.set('betaTester', this.currentTester);

    // Show thank you message
    await dialog.showMessageBox({
      type: 'info',
      title: 'Feedback Submitted',
      message: 'Thank you for your feedback!',
      detail: `Your feedback (#${feedbackId.substring(0, 8)}) has been recorded and will help improve TypeCount.`,
      buttons: ['OK']
    });

    console.log(`Feedback submitted: ${feedback.title} by ${this.currentTester.name}`);
    return feedbackId;
  }

  // Collect performance data for feedback
  private collectPerformanceData(): any {
    return {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      platform: process.platform,
      version: process.version,
      resourceUsage: process.resourceUsage ? process.resourceUsage() : null
    };
  }

  // Get all feedback items
  getAllFeedback(): FeedbackItem[] {
    return this.feedbackStore.get('feedback');
  }

  // Get feedback metrics
  getFeedbackMetrics(): BetaMetrics {
    const feedback = this.getAllFeedback();
    const now = Date.now();
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);

    const metrics: BetaMetrics = {
      totalTesters: this.currentTester ? 1 : 0,
      activeTesters: this.currentTester && new Date(this.currentTester.lastActiveAt).getTime() > sevenDaysAgo ? 1 : 0,
      feedbackItems: feedback.length,
      criticalIssues: feedback.filter(f => f.priority === 'critical' && f.status === 'open').length,
      fixedIssues: feedback.filter(f => f.status === 'fixed').length,
      averageSessionLength: 0, // Would need session tracking
      crashRate: 0, // Would need crash data
      satisfactionScore: 8, // Would need user surveys
      platformDistribution: {
        [process.platform]: 1
      },
      versionDistribution: {
        [app.getVersion()]: 1
      }
    };

    return metrics;
  }

  // Prompt for beta registration
  async promptBetaRegistration(): Promise<void> {
    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Join Beta Testing',
      message: 'Help improve TypeCount by joining our beta testing program!',
      detail: 'As a beta tester, you can:\n\n' +
              '• Provide feedback directly from the app\n' +
              '• Report bugs and suggest features\n' +
              '• Get early access to new features\n' +
              '• Help shape the future of TypeCount\n\n' +
              'Your participation is voluntary and you can opt out anytime.',
      buttons: ['Join Beta Program', 'Maybe Later'],
      defaultId: 0
    });

    if (result.response === 0) {
      await this.showRegistrationForm();
    }
  }

  // Show beta registration form
  async showRegistrationForm(): Promise<void> {
    const registrationWindow = new BrowserWindow({
      width: 600,
      height: 500,
      resizable: false,
      minimizable: false,
      maximizable: false,
      center: true,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: require.resolve('./beta-registration-preload.js')
      },
      title: 'Beta Tester Registration',
      titleBarStyle: 'default'
    });

    registrationWindow.loadURL('data:text/html,' + this.generateRegistrationFormHTML());

    registrationWindow.webContents.on('ipc-message', async (event, channel, data) => {
      if (channel === 'register-beta-tester') {
        const success = await this.registerBetaTester(data.email, data.name, data.testingLevel);
        if (success) {
          registrationWindow.close();
        }
      }
    });
  }

  // Show welcome message for new beta testers
  private async showWelcomeMessage(): Promise<void> {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Welcome to Beta Testing!',
      message: 'Thank you for joining the TypeCount beta testing program!',
      detail: 'You are now registered as a beta tester. Here\'s what you can expect:\n\n' +
              '• You may be prompted for feedback periodically\n' +
              '• Use Help → Send Feedback anytime to share your thoughts\n' +
              '• Report bugs as soon as you encounter them\n' +
              '• Your feedback helps make TypeCount better for everyone\n\n' +
              'You can adjust your beta testing preferences in Settings.',
      buttons: ['Get Started']
    });
  }

  // Check if feedback prompt should be shown
  shouldShowFeedbackPrompt(): boolean {
    if (!this.isBetaTester()) return false;

    const config = this.store.get('betaConfig');
    if (!config.lastFeedbackPrompt) return true;

    const lastPrompt = new Date(config.lastFeedbackPrompt);
    const now = new Date();
    const daysSinceLastPrompt = (now.getTime() - lastPrompt.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceLastPrompt >= config.feedbackPromptInterval;
  }

  // Show periodic feedback prompt
  async showFeedbackPrompt(): Promise<void> {
    if (!this.shouldShowFeedbackPrompt()) return;

    const result = await dialog.showMessageBox({
      type: 'question',
      title: 'Beta Feedback Request',
      message: 'How has your TypeCount experience been lately?',
      detail: 'We would love to hear your thoughts about TypeCount. Your feedback helps us make the app better for everyone.',
      buttons: ['Send Feedback', 'Remind Me Later', 'Not Now'],
      defaultId: 0
    });

    const config = this.store.get('betaConfig');
    config.lastFeedbackPrompt = new Date().toISOString();
    this.store.set('betaConfig', config);

    switch (result.response) {
      case 0: // Send Feedback
        await this.showFeedbackForm();
        break;
      case 1: // Remind Me Later
        // Will prompt again in a few days
        break;
      case 2: // Not Now
        // Will prompt again after normal interval
        break;
    }
  }

  // Export feedback data
  async exportFeedbackData(): Promise<string> {
    const feedback = this.getAllFeedback();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(app.getPath('userData'), `beta-feedback-${timestamp}.json`);

    const exportData = {
      exportedAt: new Date().toISOString(),
      tester: this.currentTester,
      feedback: feedback,
      metrics: this.getFeedbackMetrics()
    };

    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2), 'utf8');
    console.log(`Feedback data exported to: ${filename}`);

    return filename;
  }

  // Generate feedback form HTML
  private generateFeedbackFormHTML(defaultType?: FeedbackItem['type']): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Beta Feedback</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .form-container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-top: 0; }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #555;
        }
        select, input, textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            font-family: inherit;
        }
        textarea {
            resize: vertical;
            min-height: 100px;
        }
        .checkbox-group {
            margin-top: 20px;
        }
        .checkbox-group label {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
            font-weight: normal;
        }
        .checkbox-group input[type="checkbox"] {
            width: auto;
            margin-right: 10px;
        }
        .button-group {
            text-align: right;
            margin-top: 30px;
        }
        button {
            padding: 10px 20px;
            margin-left: 10px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .btn-primary {
            background: #007bff;
            color: white;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
        .btn-primary:hover { background: #0056b3; }
        .btn-secondary:hover { background: #545b62; }
    </style>
</head>
<body>
    <div class="form-container">
        <h1>TypeCount Beta Feedback</h1>
        <form id="feedback-form">
            <div class="form-group">
                <label for="type">Feedback Type</label>
                <select id="type" name="type" required>
                    <option value="bug" ${defaultType === 'bug' ? 'selected' : ''}>Bug Report</option>
                    <option value="feature_request" ${defaultType === 'feature_request' ? 'selected' : ''}>Feature Request</option>
                    <option value="improvement" ${defaultType === 'improvement' ? 'selected' : ''}>Improvement Suggestion</option>
                    <option value="praise" ${defaultType === 'praise' ? 'selected' : ''}>Praise/Compliment</option>
                    <option value="question" ${defaultType === 'question' ? 'selected' : ''}>Question/Help</option>
                </select>
            </div>

            <div class="form-group">
                <label for="priority">Priority</label>
                <select id="priority" name="priority">
                    <option value="low">Low</option>
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                </select>
            </div>

            <div class="form-group">
                <label for="title">Title</label>
                <input type="text" id="title" name="title" required placeholder="Brief description of your feedback">
            </div>

            <div class="form-group">
                <label for="description">Description</label>
                <textarea id="description" name="description" required placeholder="Provide detailed information about your feedback"></textarea>
            </div>

            <div class="form-group" id="bug-details" style="display: none;">
                <label for="steps">Steps to Reproduce (for bugs)</label>
                <textarea id="steps" name="steps" placeholder="1. First step&#10;2. Second step&#10;3. And so on..."></textarea>

                <label for="expected">Expected Behavior</label>
                <textarea id="expected" name="expected" placeholder="What did you expect to happen?"></textarea>

                <label for="actual">Actual Behavior</label>
                <textarea id="actual" name="actual" placeholder="What actually happened?"></textarea>
            </div>

            <div class="checkbox-group">
                <label>
                    <input type="checkbox" id="include-logs" name="includeLogs">
                    Include system logs with this feedback
                </label>
                <label>
                    <input type="checkbox" id="include-performance" name="includePerformance">
                    Include performance data
                </label>
            </div>

            <div class="button-group">
                <button type="button" class="btn-secondary" onclick="window.close()">Cancel</button>
                <button type="submit" class="btn-primary">Submit Feedback</button>
            </div>
        </form>
    </div>

    <script>
        document.getElementById('type').addEventListener('change', function() {
            const bugDetails = document.getElementById('bug-details');
            bugDetails.style.display = this.value === 'bug' ? 'block' : 'none';
        });

        document.getElementById('feedback-form').addEventListener('submit', function(e) {
            e.preventDefault();

            const formData = {
                type: document.getElementById('type').value,
                priority: document.getElementById('priority').value,
                title: document.getElementById('title').value,
                description: document.getElementById('description').value,
                steps: document.getElementById('steps').value.split('\\n').filter(s => s.trim()),
                expectedBehavior: document.getElementById('expected').value,
                actualBehavior: document.getElementById('actual').value,
                includeLogs: document.getElementById('include-logs').checked,
                includePerformanceData: document.getElementById('include-performance').checked
            };

            window.electronAPI.submitFeedback(formData);
        });

        // Show bug details if bug is pre-selected
        if (document.getElementById('type').value === 'bug') {
            document.getElementById('bug-details').style.display = 'block';
        }
    </script>
</body>
</html>`;
  }

  // Generate registration form HTML
  private generateRegistrationFormHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Beta Tester Registration</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .form-container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-top: 0; }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #555;
        }
        input, select {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        .info-box {
            background: #e7f3ff;
            border: 1px solid #b3d7ff;
            border-radius: 4px;
            padding: 15px;
            margin: 20px 0;
        }
        .button-group {
            text-align: right;
            margin-top: 30px;
        }
        button {
            padding: 10px 20px;
            margin-left: 10px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .btn-primary {
            background: #007bff;
            color: white;
        }
        .btn-secondary {
            background: #6c757d;
            color: white;
        }
    </style>
</head>
<body>
    <div class="form-container">
        <h1>Join TypeCount Beta Testing</h1>

        <div class="info-box">
            <strong>What does beta testing involve?</strong>
            <ul>
                <li>Testing new features before they're released</li>
                <li>Reporting bugs and providing feedback</li>
                <li>Helping improve the user experience</li>
                <li>Participating in surveys and discussions</li>
            </ul>
        </div>

        <form id="registration-form">
            <div class="form-group">
                <label for="name">Name</label>
                <input type="text" id="name" name="name" required placeholder="Your full name">
            </div>

            <div class="form-group">
                <label for="email">Email Address</label>
                <input type="email" id="email" name="email" required placeholder="your.email@example.com">
            </div>

            <div class="form-group">
                <label for="testing-level">Testing Experience Level</label>
                <select id="testing-level" name="testingLevel" required>
                    <option value="">Select your experience level</option>
                    <option value="basic">Basic - I can report bugs and give feedback</option>
                    <option value="advanced">Advanced - I can do detailed testing and performance analysis</option>
                    <option value="developer">Developer - I can test technical aspects and integrations</option>
                </select>
            </div>

            <div class="button-group">
                <button type="button" class="btn-secondary" onclick="window.close()">Cancel</button>
                <button type="submit" class="btn-primary">Register as Beta Tester</button>
            </div>
        </form>
    </div>

    <script>
        document.getElementById('registration-form').addEventListener('submit', function(e) {
            e.preventDefault();

            const formData = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                testingLevel: document.getElementById('testing-level').value
            };

            window.electronAPI.registerBetaTester(formData);
        });
    </script>
</body>
</html>`;
  }

  // Enable/disable beta testing
  setBetaTestingEnabled(enabled: boolean): void {
    const config = this.store.get('betaConfig');
    config.enabled = enabled;
    this.store.set('betaConfig', config);
    console.log(`Beta testing ${enabled ? 'enabled' : 'disabled'}`);
  }

  // Get beta testing configuration
  getBetaConfig(): BetaConfig {
    return this.store.get('betaConfig');
  }

  // Update beta testing configuration
  updateBetaConfig(updates: Partial<BetaConfig>): void {
    const config = this.store.get('betaConfig');
    const updatedConfig = { ...config, ...updates };
    this.store.set('betaConfig', updatedConfig);
  }
}

// Global instance
export const betaTesting = new BetaTestingService();

// Export types
export type { BetaTester, FeedbackItem, BetaMetrics, BetaConfig };
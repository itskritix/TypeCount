// User onboarding flow system for TypeCount

import { app, BrowserWindow, dialog, shell, systemPreferences } from 'electron';
import Store from 'electron-store';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  type: 'welcome' | 'privacy' | 'permissions' | 'features' | 'setup' | 'completion';
  required: boolean;
  platform?: string[]; // Platform-specific steps
  content: {
    headline: string;
    subheadline?: string;
    body: string;
    bullets?: string[];
    actionRequired?: boolean;
    primaryButton: {
      text: string;
      action: 'next' | 'grant_permission' | 'open_settings' | 'finish' | 'skip';
    };
    secondaryButton?: {
      text: string;
      action: 'skip' | 'back' | 'quit' | 'learn_more';
    };
  };
  validation?: () => Promise<boolean>;
  onComplete?: () => Promise<void>;
}

interface OnboardingState {
  completed: boolean;
  currentStep: string;
  skippedSteps: string[];
  completedSteps: string[];
  firstLaunch: boolean;
  privacyAccepted: boolean;
  permissionsGranted: boolean;
  featureIntroSeen: boolean;
  setupComplete: boolean;
  version: string;
}

export class OnboardingService {
  private store: Store<{ onboarding: OnboardingState }>;
  private onboardingWindow: BrowserWindow | null = null;
  private steps: OnboardingStep[];
  private currentStepIndex = 0;

  constructor() {
    this.store = new Store({
      defaults: {
        onboarding: {
          completed: false,
          currentStep: 'welcome',
          skippedSteps: [],
          completedSteps: [],
          firstLaunch: true,
          privacyAccepted: false,
          permissionsGranted: false,
          featureIntroSeen: false,
          setupComplete: false,
          version: app.getVersion()
        }
      }
    });

    this.steps = this.defineOnboardingSteps();
  }

  // Check if onboarding should run
  shouldShowOnboarding(): boolean {
    const state = this.store.get('onboarding');

    // Always show onboarding on first launch
    if (state.firstLaunch) {
      return true;
    }

    // Show onboarding if version has changed (for updates)
    if (state.version !== app.getVersion()) {
      return true;
    }

    // Show onboarding if it was never completed
    if (!state.completed) {
      return true;
    }

    // Show onboarding if permissions were never granted
    if (!state.permissionsGranted && this.isPermissionRequired()) {
      return true;
    }

    return false;
  }

  // Start the onboarding flow
  async startOnboarding(): Promise<void> {
    if (this.onboardingWindow) {
      this.onboardingWindow.focus();
      return;
    }

    this.createOnboardingWindow();
    this.currentStepIndex = 0;

    // Mark first launch as false
    this.updateState({ firstLaunch: false });

    // Show first step
    await this.showStep(this.steps[0]);
  }

  // Create onboarding window
  private createOnboardingWindow(): void {
    this.onboardingWindow = new BrowserWindow({
      width: 800,
      height: 600,
      resizable: false,
      minimizable: false,
      maximizable: false,
      center: true,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: require.resolve('./onboarding-preload.js')
      },
      title: 'Welcome to TypeCount',
      titleBarStyle: 'default',
      alwaysOnTop: true
    });

    // Load onboarding HTML
    this.onboardingWindow.loadURL('data:text/html,' + this.generateOnboardingHTML());

    this.onboardingWindow.on('closed', () => {
      this.onboardingWindow = null;
    });

    // Handle window close attempt
    this.onboardingWindow.on('close', (event) => {
      const state = this.store.get('onboarding');
      if (!state.completed) {
        event.preventDefault();
        this.showExitConfirmation();
      }
    });
  }

  // Define onboarding steps
  private defineOnboardingSteps(): OnboardingStep[] {
    const steps: OnboardingStep[] = [
      // Welcome Step
      {
        id: 'welcome',
        title: 'Welcome to TypeCount',
        description: 'Your personal typing analytics and productivity tracker',
        type: 'welcome',
        required: true,
        content: {
          headline: 'Welcome to TypeCount!',
          subheadline: 'Your Personal Typing Analytics Dashboard',
          body: 'TypeCount helps you understand your typing patterns, improve productivity, and achieve your daily goals through beautiful visualizations and engaging gamification.',
          bullets: [
            'Track your typing progress and patterns',
            'Visualize your productivity with beautiful charts',
            'Unlock achievements and complete challenges',
            'Set and reach personal typing goals',
            'Optional cloud sync across devices'
          ],
          primaryButton: {
            text: 'Get Started',
            action: 'next'
          }
        }
      },

      // Privacy Step
      {
        id: 'privacy',
        title: 'Your Privacy Matters',
        description: 'Learn how TypeCount protects your privacy',
        type: 'privacy',
        required: true,
        content: {
          headline: 'Privacy-First Design',
          subheadline: 'We never store your actual keystrokes',
          body: 'TypeCount is designed with privacy as a core principle. We believe in transparency about what data we collect and how we use it.',
          bullets: [
            '✅ We only count keystrokes, never store what you type',
            '✅ All data stays on your device by default',
            '✅ Cloud sync is completely optional',
            '✅ You own and control all your data',
            '✅ No tracking, no ads, no surveillance',
            '✅ Export your data anytime'
          ],
          actionRequired: true,
          primaryButton: {
            text: 'I Understand & Agree',
            action: 'next'
          },
          secondaryButton: {
            text: 'Learn More',
            action: 'learn_more'
          }
        },
        validation: async () => {
          return this.store.get('onboarding').privacyAccepted;
        }
      },

      // Permissions Step (macOS)
      {
        id: 'permissions_macos',
        title: 'Accessibility Permissions',
        description: 'Grant accessibility permissions for keystroke monitoring',
        type: 'permissions',
        required: true,
        platform: ['darwin'],
        content: {
          headline: 'Accessibility Permission Required',
          subheadline: 'TypeCount needs permission to monitor your typing',
          body: 'To track your keystrokes across all applications, TypeCount needs accessibility permissions. This is required for the app to function.',
          bullets: [
            'Required to count keystrokes system-wide',
            'Allows tracking across all applications',
            'Secured by macOS permission system',
            'Can be revoked anytime in System Preferences',
            'No keystroke content is ever stored'
          ],
          actionRequired: true,
          primaryButton: {
            text: 'Grant Permission',
            action: 'grant_permission'
          },
          secondaryButton: {
            text: 'Open System Preferences',
            action: 'open_settings'
          }
        },
        validation: async () => {
          if (process.platform === 'darwin') {
            return systemPreferences.isTrustedAccessibilityClient(false);
          }
          return true;
        },
        onComplete: async () => {
          this.updateState({ permissionsGranted: true });
        }
      },

      // Permissions Step (Windows)
      {
        id: 'permissions_windows',
        title: 'Administrator Access',
        description: 'Information about Windows permissions',
        type: 'permissions',
        required: false,
        platform: ['win32'],
        content: {
          headline: 'Windows Permissions',
          subheadline: 'TypeCount works best with appropriate permissions',
          body: 'On Windows, TypeCount may need to be run as administrator for full system-wide keystroke tracking. This ensures accurate counting across all applications.',
          bullets: [
            'Enables system-wide keystroke counting',
            'Ensures accurate tracking in all apps',
            'Required for some security-focused applications',
            'Windows may show security prompts',
            'You can run in limited mode if preferred'
          ],
          primaryButton: {
            text: 'Continue',
            action: 'next'
          },
          secondaryButton: {
            text: 'Learn More',
            action: 'learn_more'
          }
        }
      },

      // Features Introduction
      {
        id: 'features',
        title: 'Powerful Features',
        description: 'Discover what makes TypeCount special',
        type: 'features',
        required: false,
        content: {
          headline: 'Discover Your Typing Potential',
          subheadline: 'Powerful features to boost your productivity',
          body: 'TypeCount offers a comprehensive suite of features designed to help you understand and improve your typing habits.',
          bullets: [
            '📊 Real-time analytics and beautiful visualizations',
            '🏆 Achievement system with 25+ unlockable badges',
            '🎯 Daily and weekly challenges to keep you motivated',
            '📈 Goal setting and progress tracking',
            '🌙 Personality insights based on typing patterns',
            '☁️ Optional cloud sync across all your devices'
          ],
          primaryButton: {
            text: 'Explore Features',
            action: 'next'
          },
          secondaryButton: {
            text: 'Skip Tour',
            action: 'skip'
          }
        },
        onComplete: async () => {
          this.updateState({ featureIntroSeen: true });
        }
      },

      // Cloud Sync Setup (Optional)
      {
        id: 'cloud_setup',
        title: 'Cloud Sync Setup',
        description: 'Optionally set up cloud sync for multi-device access',
        type: 'setup',
        required: false,
        content: {
          headline: 'Cloud Sync (Optional)',
          subheadline: 'Sync your progress across all devices',
          body: 'Connect TypeCount to the cloud to access your typing statistics, achievements, and goals from any device. This is completely optional.',
          bullets: [
            'Sync data across Windows, Mac, and Linux',
            'Backup your achievements and progress',
            'Access your stats from anywhere',
            'Secure encrypted cloud storage',
            'Can be enabled or disabled anytime'
          ],
          primaryButton: {
            text: 'Set Up Cloud Sync',
            action: 'next'
          },
          secondaryButton: {
            text: 'Skip for Now',
            action: 'skip'
          }
        }
      },

      // Completion
      {
        id: 'completion',
        title: 'Ready to Begin!',
        description: 'Your TypeCount journey starts now',
        type: 'completion',
        required: true,
        content: {
          headline: 'You\'re All Set!',
          subheadline: 'TypeCount is ready to track your typing journey',
          body: 'Congratulations! TypeCount is now configured and ready to help you track, understand, and improve your typing habits. Start typing to begin collecting your personal analytics!',
          bullets: [
            'TypeCount is now running in the background',
            'Access your dashboard from the system tray',
            'Your first achievement is just keystrokes away',
            'Check your daily progress anytime',
            'Explore settings to customize your experience'
          ],
          primaryButton: {
            text: 'Start Typing!',
            action: 'finish'
          }
        },
        onComplete: async () => {
          this.updateState({
            completed: true,
            setupComplete: true,
            version: app.getVersion()
          });
        }
      }
    ];

    // Filter steps based on platform
    return steps.filter(step => {
      if (!step.platform) return true;
      return step.platform.includes(process.platform);
    });
  }

  // Show a specific step
  private async showStep(step: OnboardingStep): Promise<void> {
    if (!this.onboardingWindow) return;

    console.log(`Showing onboarding step: ${step.id}`);

    // Update window content
    this.onboardingWindow.webContents.executeJavaScript(`
      updateStep(${JSON.stringify(step)}, ${this.currentStepIndex}, ${this.steps.length});
    `);

    // Handle step-specific actions
    this.setupStepHandlers(step);
  }

  // Set up handlers for current step
  private setupStepHandlers(step: OnboardingStep): void {
    if (!this.onboardingWindow) return;

    // Remove existing handlers
    this.onboardingWindow.webContents.removeAllListeners('onboarding-action');

    // Add handler for this step
    this.onboardingWindow.webContents.on('onboarding-action', async (event, action) => {
      await this.handleAction(action, step);
    });
  }

  // Handle step actions
  private async handleAction(action: string, step: OnboardingStep): Promise<void> {
    switch (action) {
      case 'next':
        if (step.validation) {
          const isValid = await step.validation();
          if (!isValid) {
            this.showValidationError(step);
            return;
          }
        }

        if (step.onComplete) {
          await step.onComplete();
        }

        this.updateState({
          completedSteps: [...this.store.get('onboarding').completedSteps, step.id]
        });

        await this.nextStep();
        break;

      case 'skip':
        this.updateState({
          skippedSteps: [...this.store.get('onboarding').skippedSteps, step.id]
        });
        await this.nextStep();
        break;

      case 'back':
        await this.previousStep();
        break;

      case 'grant_permission':
        await this.grantPermissions(step);
        break;

      case 'open_settings':
        await this.openSystemSettings(step);
        break;

      case 'learn_more':
        await this.showLearnMore(step);
        break;

      case 'finish':
        if (step.onComplete) {
          await step.onComplete();
        }
        await this.completeOnboarding();
        break;

      case 'quit':
        app.quit();
        break;
    }
  }

  // Move to next step
  private async nextStep(): Promise<void> {
    this.currentStepIndex++;

    if (this.currentStepIndex >= this.steps.length) {
      await this.completeOnboarding();
      return;
    }

    await this.showStep(this.steps[this.currentStepIndex]);
  }

  // Move to previous step
  private async previousStep(): Promise<void> {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      await this.showStep(this.steps[this.currentStepIndex]);
    }
  }

  // Grant permissions
  private async grantPermissions(step: OnboardingStep): Promise<void> {
    if (process.platform === 'darwin' && step.id === 'permissions_macos') {
      const trusted = systemPreferences.isTrustedAccessibilityClient(true);
      if (trusted) {
        this.updateState({ permissionsGranted: true });
        await this.nextStep();
      } else {
        await this.showPermissionInstructions();
      }
    }
  }

  // Open system settings
  private async openSystemSettings(step: OnboardingStep): Promise<void> {
    if (process.platform === 'darwin') {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    } else if (process.platform === 'win32') {
      shell.openExternal('ms-settings:privacy-general');
    }
  }

  // Show learn more information
  private async showLearnMore(step: OnboardingStep): Promise<void> {
    let message = '';
    let detail = '';

    switch (step.id) {
      case 'privacy':
        message = 'TypeCount Privacy Details';
        detail = 'TypeCount is designed with privacy as the highest priority. We:\n\n' +
                 '• Never store actual keystrokes or text content\n' +
                 '• Only count the number of keys pressed\n' +
                 '• Store all data locally by default\n' +
                 '• Use encryption for cloud sync (if enabled)\n' +
                 '• Provide full data export capabilities\n' +
                 '• Are transparent about all data collection\n\n' +
                 'You maintain full control over your data at all times.';
        break;

      case 'permissions_macos':
        message = 'macOS Accessibility Permissions';
        detail = 'TypeCount needs accessibility permissions to:\n\n' +
                 '• Count keystrokes across all applications\n' +
                 '• Provide accurate typing statistics\n' +
                 '• Track productivity patterns\n\n' +
                 'This permission can be revoked anytime in System Preferences > Security & Privacy > Accessibility.';
        break;

      default:
        message = 'More Information';
        detail = 'Learn more about this feature in the TypeCount documentation.';
    }

    await dialog.showMessageBox(this.onboardingWindow!, {
      type: 'info',
      title: message,
      message: message,
      detail: detail,
      buttons: ['OK']
    });
  }

  // Show permission instructions
  private async showPermissionInstructions(): Promise<void> {
    await dialog.showMessageBox(this.onboardingWindow!, {
      type: 'info',
      title: 'Permission Instructions',
      message: 'Accessibility Permission Setup',
      detail: 'To grant accessibility permissions:\n\n' +
              '1. Open System Preferences\n' +
              '2. Go to Security & Privacy\n' +
              '3. Click the Privacy tab\n' +
              '4. Select Accessibility from the left sidebar\n' +
              '5. Click the lock to make changes\n' +
              '6. Check the box next to TypeCount\n\n' +
              'TypeCount will automatically detect when permissions are granted.',
      buttons: ['OK', 'Open System Preferences']
    });
  }

  // Show validation error
  private showValidationError(step: OnboardingStep): void {
    let message = 'Please complete this step to continue.';

    if (step.id === 'privacy') {
      message = 'Please accept the privacy terms to continue using TypeCount.';
    } else if (step.id === 'permissions_macos') {
      message = 'Accessibility permissions are required for TypeCount to function properly.';
    }

    dialog.showErrorBox('Step Incomplete', message);
  }

  // Complete onboarding
  private async completeOnboarding(): Promise<void> {
    console.log('Onboarding completed');

    this.updateState({
      completed: true,
      setupComplete: true,
      currentStep: 'completed',
      version: app.getVersion()
    });

    if (this.onboardingWindow) {
      this.onboardingWindow.close();
    }

    // Show completion notification
    await dialog.showMessageBox({
      type: 'info',
      title: 'Welcome to TypeCount!',
      message: 'Setup Complete',
      detail: 'TypeCount is now running and tracking your typing activity. You can access your dashboard from the system tray icon.',
      buttons: ['OK']
    });
  }

  // Show exit confirmation
  private async showExitConfirmation(): Promise<void> {
    const result = await dialog.showMessageBox(this.onboardingWindow!, {
      type: 'question',
      title: 'Exit Setup?',
      message: 'Are you sure you want to exit the setup process?',
      detail: 'TypeCount may not work properly without completing the setup.',
      buttons: ['Continue Setup', 'Exit Anyway'],
      defaultId: 0,
      cancelId: 0
    });

    if (result.response === 1) {
      app.quit();
    }
  }

  // Update onboarding state
  private updateState(updates: Partial<OnboardingState>): void {
    const currentState = this.store.get('onboarding');
    this.store.set('onboarding', { ...currentState, ...updates });
  }

  // Check if permission is required for current platform
  private isPermissionRequired(): boolean {
    return process.platform === 'darwin';
  }

  // Generate onboarding HTML
  private generateOnboardingHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TypeCount Setup</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            height: 100vh;
            overflow: hidden;
        }

        .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
            max-width: 600px;
            margin: 0 auto;
            background: white;
            box-shadow: 0 0 50px rgba(0,0,0,0.3);
        }

        .header {
            background: #4a90e2;
            color: white;
            padding: 20px;
            text-align: center;
        }

        .step-indicator {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 10px;
            margin-top: 10px;
        }

        .step-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: rgba(255,255,255,0.3);
            transition: background 0.3s;
        }

        .step-dot.active {
            background: white;
        }

        .step-dot.completed {
            background: #4CAF50;
        }

        .content {
            flex: 1;
            padding: 40px;
            overflow-y: auto;
        }

        .headline {
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #2c3e50;
        }

        .subheadline {
            font-size: 18px;
            color: #7f8c8d;
            margin-bottom: 20px;
        }

        .body {
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 20px;
            color: #34495e;
        }

        .bullets {
            list-style: none;
            margin-bottom: 30px;
        }

        .bullets li {
            padding: 8px 0;
            padding-left: 20px;
            position: relative;
            color: #2c3e50;
        }

        .bullets li::before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #27ae60;
            font-weight: bold;
        }

        .footer {
            padding: 20px;
            background: #f8f9fa;
            border-top: 1px solid #dee2e6;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .button {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s;
            text-decoration: none;
            display: inline-block;
        }

        .button.primary {
            background: #4a90e2;
            color: white;
        }

        .button.primary:hover {
            background: #357abd;
        }

        .button.secondary {
            background: #6c757d;
            color: white;
        }

        .button.secondary:hover {
            background: #5a6268;
        }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #4a90e2;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 id="step-title">Welcome to TypeCount</h1>
            <p id="step-description">Your personal typing analytics and productivity tracker</p>
            <div class="step-indicator" id="step-indicator">
                <!-- Steps will be populated by JavaScript -->
            </div>
        </div>

        <div class="content" id="content">
            <h2 class="headline" id="headline">Loading...</h2>
            <p class="subheadline" id="subheadline"></p>
            <p class="body" id="body">Please wait while we prepare your onboarding experience.</p>
            <ul class="bullets" id="bullets"></ul>
        </div>

        <div class="footer">
            <button class="button secondary" id="secondary-button" style="display: none;">Back</button>
            <button class="button primary" id="primary-button">Loading...</button>
        </div>
    </div>

    <script>
        let currentStep = null;

        function updateStep(step, currentIndex, totalSteps) {
            currentStep = step;

            // Update header
            document.getElementById('step-title').textContent = step.title;
            document.getElementById('step-description').textContent = step.description;

            // Update step indicator
            const indicator = document.getElementById('step-indicator');
            indicator.innerHTML = '';
            for (let i = 0; i < totalSteps; i++) {
                const dot = document.createElement('div');
                dot.className = 'step-dot';
                if (i < currentIndex) dot.classList.add('completed');
                if (i === currentIndex) dot.classList.add('active');
                indicator.appendChild(dot);
            }

            // Update content
            document.getElementById('headline').textContent = step.content.headline;
            document.getElementById('subheadline').textContent = step.content.subheadline || '';
            document.getElementById('body').textContent = step.content.body;

            // Update bullets
            const bulletsContainer = document.getElementById('bullets');
            bulletsContainer.innerHTML = '';
            if (step.content.bullets) {
                step.content.bullets.forEach(bullet => {
                    const li = document.createElement('li');
                    li.textContent = bullet;
                    bulletsContainer.appendChild(li);
                });
            }

            // Update buttons
            const primaryBtn = document.getElementById('primary-button');
            const secondaryBtn = document.getElementById('secondary-button');

            primaryBtn.textContent = step.content.primaryButton.text;
            primaryBtn.onclick = () => handleAction(step.content.primaryButton.action);

            if (step.content.secondaryButton) {
                secondaryBtn.textContent = step.content.secondaryButton.text;
                secondaryBtn.onclick = () => handleAction(step.content.secondaryButton.action);
                secondaryBtn.style.display = 'block';
            } else {
                secondaryBtn.style.display = 'none';
            }

            // Handle privacy acceptance
            if (step.id === 'privacy') {
                addPrivacyAcceptance();
            }
        }

        function handleAction(action) {
            // Show loading state for certain actions
            if (action === 'grant_permission' || action === 'next') {
                const primaryBtn = document.getElementById('primary-button');
                primaryBtn.innerHTML = primaryBtn.textContent + '<span class="loading"></span>';
                primaryBtn.disabled = true;
            }

            // Send action to main process
            if (typeof window.electronAPI !== 'undefined') {
                window.electronAPI.sendAction(action);
            }
        }

        function addPrivacyAcceptance() {
            const content = document.getElementById('content');
            let checkbox = document.getElementById('privacy-checkbox');

            if (!checkbox) {
                const checkboxContainer = document.createElement('div');
                checkboxContainer.style.marginTop = '20px';
                checkboxContainer.innerHTML = `
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="checkbox" id="privacy-checkbox" style="transform: scale(1.2);">
                        <span>I understand and agree to TypeCount's privacy practices</span>
                    </label>
                `;
                content.appendChild(checkboxContainer);

                checkbox = document.getElementById('privacy-checkbox');
                checkbox.addEventListener('change', (e) => {
                    const primaryBtn = document.getElementById('primary-button');
                    if (e.target.checked) {
                        primaryBtn.disabled = false;
                        primaryBtn.style.opacity = '1';
                        // Store privacy acceptance
                        window.electronAPI.acceptPrivacy();
                    } else {
                        primaryBtn.disabled = true;
                        primaryBtn.style.opacity = '0.5';
                    }
                });

                // Initially disable primary button
                const primaryBtn = document.getElementById('primary-button');
                primaryBtn.disabled = true;
                primaryBtn.style.opacity = '0.5';
            }
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            console.log('Onboarding UI loaded');
        });
    </script>
</body>
</html>`;
  }

  // Reset onboarding (for testing or forced re-onboarding)
  resetOnboarding(): void {
    this.store.set('onboarding', {
      completed: false,
      currentStep: 'welcome',
      skippedSteps: [],
      completedSteps: [],
      firstLaunch: true,
      privacyAccepted: false,
      permissionsGranted: false,
      featureIntroSeen: false,
      setupComplete: false,
      version: app.getVersion()
    });
  }

  // Get onboarding state
  getOnboardingState(): OnboardingState {
    return this.store.get('onboarding');
  }
}

// Global instance
export const onboardingService = new OnboardingService();

// Export types
export type { OnboardingStep, OnboardingState };
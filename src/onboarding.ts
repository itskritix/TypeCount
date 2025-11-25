// User onboarding flow system for TypeCount

import { app, BrowserWindow, dialog, ipcMain, shell, systemPreferences } from 'electron';
import Store from 'electron-store';
import path from 'node:path';

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

  // Register IPC handlers for onboarding communication
  registerIpcHandlers(): void {
    ipcMain.on('onboarding-action', (event, action: string) => {
      // Forward to the window's internal handler
      event.sender.emit('onboarding-action', event, action);
    });

    ipcMain.on('onboarding-accept-privacy', () => {
      const state = this.getOnboardingState();
      this.updateState({ ...state, privacyAccepted: true });
    });
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
      fullscreen: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      frame: false,
      transparent: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'onboarding-preload.js')
      },
      title: 'Welcome to TypeCount',
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      show: false
    });

    // Show window when ready to prevent flash
    this.onboardingWindow.once('ready-to-show', () => {
      this.onboardingWindow?.show();
    });

    // Load onboarding HTML
    this.onboardingWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(this.generateOnboardingHTML())}`);

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
        description: 'Your productivity journey starts here',
        type: 'welcome',
        required: true,
        content: {
          headline: 'Master Your Flow',
          subheadline: 'Track, Analyze, Improve.',
          body: 'TypeCount runs silently in the background, transforming your daily typing habits into actionable insights and rewarding achievements.',
          bullets: [
            'Real-time keystroke analytics',
            'Streak tracking & daily goals',
            'Gamified achievements system',
            '100% Private & Local',
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
        title: 'Your Privacy First',
        description: 'Your data stays yours. Period.',
        type: 'privacy',
        required: true,
        content: {
          headline: 'No Keylogging. Ever.',
          subheadline: 'We count clicks, not content.',
          body: 'We believe productivity tracking shouldn\'t cost you your privacy. TypeCount is architected to be secure by default.',
          bullets: [
            'We never record what you type',
            'We only count how many keys are pressed',
            'Data is stored locally on your device',
            'Cloud sync is completely optional & encrypted'
          ],
          actionRequired: true,
          primaryButton: {
            text: 'I Accept & Continue',
            action: 'next'
          },
          secondaryButton: {
            text: 'Read Policy',
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
        title: 'System Access',
        description: 'Enable tracking on macOS',
        type: 'permissions',
        required: true,
        platform: ['darwin'],
        content: {
          headline: 'Enable Accessibility',
          subheadline: 'Required for global tracking',
          body: 'To count keystrokes across all your apps (VS Code, Slack, Browser, etc.), macOS requires you to grant Accessibility permissions to TypeCount.',
          bullets: [
            'System-wide accuracy',
            'Secure & Revocable anytime',
            'No content recording'
          ],
          actionRequired: true,
          primaryButton: {
            text: 'Open System Preferences',
            action: 'grant_permission'
          },
          secondaryButton: {
            text: 'Why is this needed?',
            action: 'learn_more'
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

      // Permissions Step (Windows) - UPDATED for asInvoker
      {
        id: 'permissions_windows',
        title: 'System Setup',
        description: 'Optimizing for Windows',
        type: 'permissions',
        required: false, // Not blocking
        platform: ['win32'],
        content: {
          headline: 'Ready to Track',
          subheadline: 'Seamless Integration',
          body: 'TypeCount is ready to run. For the best experience, no special action is needed for most users.',
          bullets: [
            'Tracking enabled for all standard apps',
            'Admin windows (e.g. Task Manager) are excluded for security',
            'Auto-start enabled for consistent tracking'
          ],
          primaryButton: {
            text: 'Continue',
            action: 'next'
          }
        }
      },

      // Features / Gamification
      {
        id: 'features',
        title: 'Gamify Your Work',
        description: 'Typing is now a game',
        type: 'features',
        required: false,
        content: {
          headline: 'Level Up Your Productivity',
          subheadline: 'Earn XP as you work',
          body: 'Turn your daily emails and code into progress. Unlock badges, compete in challenges, and watch your stats grow.',
          bullets: [
            '25+ Achievements to unlock',
            'Visual heatmaps of your peak hours',
            'Daily Streak challenges',
            'Set custom typing goals'
          ],
          primaryButton: {
            text: 'Next: Cloud Sync',
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

      // Cloud Sync Setup
      {
        id: 'cloud_setup',
        title: 'Cloud Sync',
        description: 'Backup your progress',
        type: 'setup',
        required: false,
        content: {
          headline: 'Sync Across Devices',
          subheadline: 'Never lose your streak',
          body: 'Create a free account to sync your levels, XP, and stats across your Windows, Mac, and Linux machines.',
          bullets: [
            'Real-time cross-device sync',
            'Cloud backup for your stats',
            'End-to-end encrypted transfer'
          ],
          primaryButton: {
            text: 'Set Up Later', // Encouraging flow to finish
            action: 'next'
          },
          secondaryButton: {
            text: 'Skip',
            action: 'skip'
          }
        }
      },

      // Completion
      {
        id: 'completion',
        title: 'All Set!',
        description: 'Let\'s get typing',
        type: 'completion',
        required: true,
        content: {
          headline: 'You\'re Ready!',
          subheadline: 'TypeCount is now active',
          body: 'The app will run silently in your system tray. Click the icon anytime to see your stats or access the dashboard.',
          bullets: [
            'Check the tray icon for quick stats',
            'Use the dashboard for deep analytics',
            'Start typing to earn your first XP!'
          ],
          primaryButton: {
            text: 'Open Dashboard',
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
    <title>Welcome to TypeCount</title>
    <style>
        :root {
            --bg-dark: #050507;
            --bg-card: #0a0a0f;
            --bg-surface: #111118;
            --text-primary: #ffffff;
            --text-secondary: #71717a;
            --text-muted: #52525b;
            --accent-cyan: #06b6d4;
            --accent-violet: #8b5cf6;
            --accent-emerald: #10b981;
            --accent-amber: #f59e0b;
            --accent-rose: #f43f5e;
            --border-subtle: rgba(255,255,255,0.06);
            --border-glow: rgba(6, 182, 212, 0.3);
            --gradient-primary: linear-gradient(135deg, #06b6d4, #8b5cf6);
            --gradient-shine: linear-gradient(135deg, rgba(255,255,255,0.1), transparent);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: var(--bg-dark);
            color: var(--text-primary);
            height: 100vh;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
        }

        /* Animated background */
        .bg-effects {
            position: fixed;
            inset: 0;
            overflow: hidden;
            pointer-events: none;
            z-index: 0;
        }

        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(80px);
            opacity: 0.4;
            animation: float 20s ease-in-out infinite;
        }

        .orb-1 {
            width: 400px;
            height: 400px;
            background: var(--accent-cyan);
            top: -100px;
            left: -100px;
            animation-delay: 0s;
        }

        .orb-2 {
            width: 350px;
            height: 350px;
            background: var(--accent-violet);
            bottom: -80px;
            right: -80px;
            animation-delay: -7s;
        }

        .orb-3 {
            width: 200px;
            height: 200px;
            background: var(--accent-emerald);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation-delay: -14s;
            opacity: 0.2;
        }

        @keyframes float {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(30px, -30px) scale(1.05); }
            50% { transform: translate(-20px, 20px) scale(0.95); }
            75% { transform: translate(20px, 30px) scale(1.02); }
        }

        /* Grid pattern overlay */
        .grid-overlay {
            position: absolute;
            inset: 0;
            background-image:
                linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
            background-size: 50px 50px;
            mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
        }

        /* Main container */
        .container {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 900px;
            height: 100%;
            max-height: 700px;
            margin: 20px;
            background: rgba(10, 10, 15, 0.8);
            backdrop-filter: blur(40px);
            border: 1px solid var(--border-subtle);
            border-radius: 24px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow:
                0 0 0 1px rgba(255,255,255,0.05),
                0 25px 50px -12px rgba(0,0,0,0.8),
                inset 0 1px 0 rgba(255,255,255,0.05);
        }

        /* Progress bar */
        .progress-track {
            height: 3px;
            background: rgba(255,255,255,0.05);
            position: relative;
            overflow: hidden;
        }

        .progress-bar {
            height: 100%;
            background: var(--gradient-primary);
            width: 0%;
            transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
            position: relative;
        }

        .progress-bar::after {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: 100px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
            animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100px); }
            100% { transform: translateX(100vw); }
        }

        /* Step indicators */
        .step-dots {
            display: flex;
            justify-content: center;
            gap: 8px;
            padding: 20px;
        }

        .step-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            transition: all 0.3s ease;
        }

        .step-dot.active {
            background: var(--accent-cyan);
            box-shadow: 0 0 12px var(--accent-cyan);
        }

        .step-dot.completed {
            background: var(--accent-emerald);
        }

        /* Content area */
        .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px 60px 40px;
            text-align: center;
            transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .content.transitioning {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
        }

        /* Logo */
        .logo-container {
            position: relative;
            margin-bottom: 24px;
        }

        .logo {
            width: 90px;
            height: 90px;
            filter: drop-shadow(0 10px 40px rgba(144, 144, 144, 0.4));
            animation: logo-float 4s ease-in-out infinite;
        }

        .logo svg {
            width: 100%;
            height: 100%;
        }

        @keyframes logo-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
        }

        /* Typing animation for logo */
        .typing-cursor {
            position: absolute;
            right: -8px;
            top: 50%;
            transform: translateY(-50%);
            width: 3px;
            height: 24px;
            background: white;
            animation: blink 1s step-end infinite;
        }

        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }

        /* Step badge */
        .step-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 100px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            color: var(--text-secondary);
            margin-bottom: 16px;
        }

        .step-badge-dot {
            width: 6px;
            height: 6px;
            background: var(--accent-cyan);
            border-radius: 50%;
            animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.7; }
        }

        /* Headlines */
        .headline {
            font-size: 42px;
            font-weight: 800;
            letter-spacing: -1.5px;
            line-height: 1.1;
            margin-bottom: 12px;
            background: linear-gradient(180deg, #ffffff 0%, #a1a1aa 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .subheadline {
            font-size: 18px;
            font-weight: 500;
            background: var(--gradient-primary);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 20px;
        }

        .body-text {
            font-size: 15px;
            line-height: 1.7;
            color: var(--text-secondary);
            max-width: 500px;
            margin-bottom: 32px;
        }

        /* Feature cards */
        .features {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            width: 100%;
            max-width: 560px;
        }

        .feature-card {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 18px;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 12px;
            text-align: left;
            transition: all 0.2s ease;
        }

        .feature-card:hover {
            background: rgba(255,255,255,0.04);
            border-color: rgba(6, 182, 212, 0.2);
            transform: translateY(-2px);
        }

        .feature-icon {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            flex-shrink: 0;
        }

        .feature-icon.cyan { background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); }
        .feature-icon.violet { background: rgba(139, 92, 246, 0.15); color: var(--accent-violet); }
        .feature-icon.emerald { background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); }
        .feature-icon.amber { background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); }

        .feature-text {
            font-size: 13px;
            font-weight: 500;
            color: var(--text-primary);
        }

        /* Custom content area */
        .custom-area {
            width: 100%;
            max-width: 400px;
            margin-top: 8px;
        }

        /* Privacy checkbox */
        .privacy-toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 14px;
            padding: 16px 24px;
            background: rgba(6, 182, 212, 0.05);
            border: 1px solid rgba(6, 182, 212, 0.15);
            border-radius: 14px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .privacy-toggle:hover {
            background: rgba(6, 182, 212, 0.08);
            border-color: rgba(6, 182, 212, 0.3);
        }

        .privacy-toggle.checked {
            background: rgba(16, 185, 129, 0.1);
            border-color: rgba(16, 185, 129, 0.3);
        }

        .checkbox-custom {
            width: 22px;
            height: 22px;
            border: 2px solid rgba(255,255,255,0.2);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            flex-shrink: 0;
        }

        .privacy-toggle.checked .checkbox-custom {
            background: var(--accent-emerald);
            border-color: var(--accent-emerald);
        }

        .checkbox-custom svg {
            width: 14px;
            height: 14px;
            stroke: white;
            stroke-width: 3;
            opacity: 0;
            transform: scale(0.5);
            transition: all 0.2s ease;
        }

        .privacy-toggle.checked .checkbox-custom svg {
            opacity: 1;
            transform: scale(1);
        }

        .privacy-label {
            font-size: 14px;
            font-weight: 500;
            color: var(--text-primary);
        }

        /* Footer */
        .footer {
            padding: 24px 40px;
            background: rgba(0,0,0,0.3);
            border-top: 1px solid var(--border-subtle);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        /* Buttons */
        .btn {
            padding: 14px 32px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);
            border: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            min-width: 140px;
        }

        .btn-primary {
            background: var(--gradient-primary);
            color: white;
            position: relative;
            overflow: hidden;
            box-shadow:
                0 0 20px rgba(6, 182, 212, 0.3),
                0 4px 15px rgba(139, 92, 246, 0.2);
        }

        .btn-primary::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(255,255,255,0.2), transparent);
            opacity: 0;
            transition: opacity 0.2s;
        }

        .btn-primary:hover:not(:disabled)::before {
            opacity: 1;
        }

        .btn-primary:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow:
                0 0 30px rgba(6, 182, 212, 0.4),
                0 8px 25px rgba(139, 92, 246, 0.3);
        }

        .btn-primary:active:not(:disabled) {
            transform: translateY(0);
        }

        .btn-primary:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            box-shadow: none;
        }

        .btn-secondary {
            background: transparent;
            color: var(--text-secondary);
            border: 1px solid rgba(255,255,255,0.1);
        }

        .btn-secondary:hover {
            background: rgba(255,255,255,0.05);
            color: var(--text-primary);
            border-color: rgba(255,255,255,0.15);
        }

        /* Spinner */
        .spinner {
            width: 18px;
            height: 18px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* Arrow icon */
        .arrow-icon {
            transition: transform 0.2s ease;
        }

        .btn-primary:hover .arrow-icon {
            transform: translateX(3px);
        }

        /* Completion celebration */
        .celebration {
            position: absolute;
            inset: 0;
            pointer-events: none;
            overflow: hidden;
        }

        .confetti {
            position: absolute;
            width: 10px;
            height: 10px;
            background: var(--accent-cyan);
            animation: confetti-fall 3s ease-out forwards;
        }

        @keyframes confetti-fall {
            0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
    </style>
</head>
<body>
    <div class="bg-effects">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
        <div class="grid-overlay"></div>
    </div>

    <div class="container">
        <div class="progress-track">
            <div class="progress-bar" id="progress-bar"></div>
        </div>

        <div class="step-dots" id="step-dots"></div>

        <div class="content" id="content">
            <div class="logo-container">
                <div class="logo">
                    <svg viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="ob_bg_grad" x1="512" y1="0" x2="512" y2="1024" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stop-color="#4a4a4a"/>
                                <stop offset="1" stop-color="#2b2b2b"/>
                            </linearGradient>
                            <linearGradient id="ob_glass_surface" x1="112" y1="112" x2="912" y2="912" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stop-color="white" stop-opacity="0.4"/>
                                <stop offset="0.5" stop-color="white" stop-opacity="0.1"/>
                                <stop offset="1" stop-color="white" stop-opacity="0.05"/>
                            </linearGradient>
                            <linearGradient id="ob_glass_border" x1="112" y1="112" x2="912" y2="912" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stop-color="white" stop-opacity="0.8"/>
                                <stop offset="1" stop-color="white" stop-opacity="0.1"/>
                            </linearGradient>
                            <linearGradient id="ob_liquid_grad" x1="300" y1="300" x2="700" y2="700" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stop-color="#e0e0e0"/>
                                <stop offset="1" stop-color="#909090"/>
                            </linearGradient>
                            <radialGradient id="ob_liquid_highlight" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(450 400) rotate(45) scale(150)">
                                <stop offset="0" stop-color="white" stop-opacity="0.95"/>
                                <stop offset="1" stop-color="white" stop-opacity="0"/>
                            </radialGradient>
                        </defs>
                        <rect x="112" y="112" width="800" height="800" rx="180" fill="url(#ob_bg_grad)"/>
                        <rect x="112" y="112" width="800" height="800" rx="180" fill="url(#ob_glass_surface)"/>
                        <rect x="112" y="112" width="800" height="800" rx="180" stroke="url(#ob_glass_border)" stroke-width="6"/>
                        <path d="M512 280 C 680 240, 760 400, 740 512 C 720 650, 600 760, 512 740 C 400 720, 280 640, 300 512 C 320 380, 420 300, 512 280 Z" fill="url(#ob_liquid_grad)"/>
                        <ellipse cx="420" cy="420" rx="80" ry="50" transform="rotate(-30 420 420)" fill="url(#ob_liquid_highlight)"/>
                    </svg>
                </div>
            </div>

            <div class="step-badge">
                <span class="step-badge-dot"></span>
                <span id="step-label">Welcome</span>
            </div>

            <h1 class="headline" id="headline">Welcome to TypeCount</h1>
            <p class="subheadline" id="subheadline">Your productivity journey starts here</p>
            <p class="body-text" id="body-text">Loading...</p>

            <div class="features" id="features"></div>
            <div class="custom-area" id="custom-area"></div>
        </div>

        <div class="footer">
            <button class="btn btn-secondary" id="secondary-btn" style="visibility: hidden;">Skip</button>
            <button class="btn btn-primary" id="primary-btn">
                <span id="btn-text">Get Started</span>
                <svg class="arrow-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
            </button>
        </div>
    </div>

    <script>
        const icons = ['⌨️', '📊', '🔥', '🔒', '🎮', '☁️', '✨', '🏆'];
        const iconColors = ['cyan', 'violet', 'emerald', 'amber'];
        let totalSteps = 6;
        let currentStep = 0;

        const $ = id => document.getElementById(id);

        function renderStepDots(current, total) {
            const container = $('step-dots');
            container.innerHTML = '';
            for (let i = 0; i < total; i++) {
                const dot = document.createElement('div');
                dot.className = 'step-dot';
                if (i < current) dot.classList.add('completed');
                if (i === current) dot.classList.add('active');
                container.appendChild(dot);
            }
        }

        function updateStep(step, index, total) {
            currentStep = index;
            totalSteps = total;

            const content = $('content');
            content.classList.add('transitioning');

            setTimeout(() => {
                // Update progress
                const progress = ((index + 1) / total) * 100;
                $('progress-bar').style.width = progress + '%';
                renderStepDots(index, total);

                // Update content
                $('step-label').textContent = step.title;
                $('headline').textContent = step.content.headline;
                $('subheadline').textContent = step.content.subheadline || '';
                $('body-text').textContent = step.content.body;

                // Update features
                const featuresEl = $('features');
                featuresEl.innerHTML = '';
                if (step.content.bullets) {
                    step.content.bullets.forEach((bullet, i) => {
                        const card = document.createElement('div');
                        card.className = 'feature-card';
                        card.innerHTML = \`
                            <div class="feature-icon \${iconColors[i % iconColors.length]}">\${icons[i % icons.length]}</div>
                            <span class="feature-text">\${bullet}</span>
                        \`;
                        featuresEl.appendChild(card);
                    });
                }

                // Update buttons - restore full button structure
                const primaryBtn = $('primary-btn');
                primaryBtn.innerHTML = \`
                    <span id="btn-text">\${step.content.primaryButton.text}</span>
                    <svg class="arrow-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                \`;
                primaryBtn.disabled = false;
                primaryBtn.style.width = ''; // Reset width
                primaryBtn.onclick = () => sendAction(step.content.primaryButton.action);

                const secondaryBtn = $('secondary-btn');
                if (step.content.secondaryButton) {
                    secondaryBtn.style.visibility = 'visible';
                    secondaryBtn.textContent = step.content.secondaryButton.text;
                    secondaryBtn.onclick = () => sendAction(step.content.secondaryButton.action);
                } else {
                    secondaryBtn.style.visibility = 'hidden';
                }

                // Custom content
                const customArea = $('custom-area');
                customArea.innerHTML = '';

                if (step.id === 'privacy') {
                    const toggle = document.createElement('div');
                    toggle.className = 'privacy-toggle';
                    toggle.innerHTML = \`
                        <div class="checkbox-custom">
                            <svg viewBox="0 0 24 24" fill="none">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                        <span class="privacy-label">I understand and accept the privacy terms</span>
                    \`;
                    customArea.appendChild(toggle);

                    primaryBtn.disabled = true;

                    toggle.addEventListener('click', () => {
                        toggle.classList.toggle('checked');
                        const isChecked = toggle.classList.contains('checked');
                        primaryBtn.disabled = !isChecked;
                        if (isChecked) window.electronAPI.acceptPrivacy();
                    });
                }

                // Show celebration on completion step
                if (step.id === 'completion') {
                    createCelebration();
                }

                content.classList.remove('transitioning');
            }, 300);
        }

        function sendAction(action) {
            const primaryBtn = $('primary-btn');
            if (action === 'next' || action === 'grant_permission' || action === 'finish') {
                const width = primaryBtn.offsetWidth;
                primaryBtn.style.width = width + 'px';
                primaryBtn.innerHTML = '<div class="spinner"></div>';
            }
            window.electronAPI.sendAction(action);
        }

        function createCelebration() {
            const container = document.createElement('div');
            container.className = 'celebration';

            const colors = ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e'];

            for (let i = 0; i < 50; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * 100 + '%';
                confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.animationDelay = Math.random() * 2 + 's';
                confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
                container.appendChild(confetti);
            }

            document.body.appendChild(container);
            setTimeout(() => container.remove(), 5000);
        }

        // Initialize
        renderStepDots(0, 6);
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
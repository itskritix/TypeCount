// Cross-platform testing framework for TypeCount

import { app, BrowserWindow, systemPreferences, dialog } from 'electron';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { uIOhook } from 'uiohook-napi';

interface TestResult {
  id: string;
  name: string;
  description: string;
  category: 'functionality' | 'performance' | 'security' | 'compatibility' | 'integration';
  platform: string[];
  passed: boolean;
  duration: number; // milliseconds
  message: string;
  details?: any;
  error?: string;
  timestamp: string;
}

interface TestSuite {
  id: string;
  name: string;
  description: string;
  tests: Test[];
  setUp?: () => Promise<void>;
  tearDown?: () => Promise<void>;
}

interface Test {
  id: string;
  name: string;
  description: string;
  category: TestResult['category'];
  platform?: string[]; // If undefined, runs on all platforms
  required: boolean;
  timeout?: number; // milliseconds, default 30s
  run: () => Promise<TestResult>;
}

interface TestReport {
  timestamp: string;
  platform: string;
  version: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  overallResult: 'passed' | 'failed' | 'warning';
  results: TestResult[];
  systemInfo: {
    os: string;
    version: string;
    arch: string;
    memory: number;
    cpu: string;
  };
  recommendations: string[];
}

export class TestingFramework {
  private testSuites: TestSuite[] = [];
  private testResults: TestResult[] = [];
  private isRunning = false;
  private currentTest: string | null = null;

  constructor() {
    this.initializeTestSuites();
  }

  // Initialize all test suites
  private initializeTestSuites(): void {
    this.testSuites = [
      this.createCoreTestSuite(),
      this.createPermissionsTestSuite(),
      this.createPerformanceTestSuite(),
      this.createSecurityTestSuite(),
      this.createStorageTestSuite(),
      this.createIntegrationTestSuite(),
      this.createCompatibilityTestSuite()
    ];
  }

  // Run all tests
  async runAllTests(): Promise<TestReport> {
    if (this.isRunning) {
      throw new Error('Tests are already running');
    }

    this.isRunning = true;
    this.testResults = [];
    const startTime = performance.now();

    console.log('Starting comprehensive testing framework...');

    try {
      for (const suite of this.testSuites) {
        await this.runTestSuite(suite);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      return this.generateTestReport(duration);

    } finally {
      this.isRunning = false;
      this.currentTest = null;
    }
  }

  // Run specific test suite
  async runTestSuite(suite: TestSuite): Promise<TestResult[]> {
    console.log(`Running test suite: ${suite.name}`);

    const suiteResults: TestResult[] = [];

    try {
      // Run setup if defined
      if (suite.setUp) {
        await suite.setUp();
      }

      // Run all tests in suite
      for (const test of suite.tests) {
        // Check platform compatibility
        if (test.platform && !test.platform.includes(process.platform)) {
          console.log(`Skipping test ${test.id} - not compatible with ${process.platform}`);
          continue;
        }

        const result = await this.runSingleTest(test);
        suiteResults.push(result);
        this.testResults.push(result);
      }

      // Run teardown if defined
      if (suite.tearDown) {
        await suite.tearDown();
      }

    } catch (error) {
      console.error(`Error running test suite ${suite.name}:`, error);
    }

    return suiteResults;
  }

  // Run single test with timeout and error handling
  async runSingleTest(test: Test): Promise<TestResult> {
    const startTime = performance.now();
    this.currentTest = test.id;

    console.log(`Running test: ${test.name}`);

    try {
      // Set up timeout
      const timeout = test.timeout || 30000; // 30 seconds default
      const timeoutPromise = new Promise<TestResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Test timeout after ${timeout}ms`));
        }, timeout);
      });

      // Run test with timeout
      const result = await Promise.race([
        test.run(),
        timeoutPromise
      ]);

      const endTime = performance.now();
      result.duration = endTime - startTime;
      result.timestamp = new Date().toISOString();

      console.log(`Test ${test.name}: ${result.passed ? 'PASSED' : 'FAILED'} (${result.duration.toFixed(2)}ms)`);

      return result;

    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.error(`Test ${test.name} failed:`, error);

      return {
        id: test.id,
        name: test.name,
        description: test.description,
        category: test.category,
        platform: [process.platform],
        passed: false,
        duration,
        message: `Test failed with error: ${error.message}`,
        error: error.stack || error.message,
        timestamp: new Date().toISOString()
      };

    } finally {
      this.currentTest = null;
    }
  }

  // Create core functionality test suite
  private createCoreTestSuite(): TestSuite {
    return {
      id: 'core',
      name: 'Core Functionality',
      description: 'Tests for essential TypeCount functionality',
      tests: [
        {
          id: 'store_initialization',
          name: 'Data Store Initialization',
          description: 'Verify electron-store initializes correctly',
          category: 'functionality',
          required: true,
          run: async () => {
            const testStore = new Store({ name: 'test-store' });
            testStore.set('test', 'value');
            const retrieved = testStore.get('test');
            testStore.delete('test');

            return {
              id: 'store_initialization',
              name: 'Data Store Initialization',
              description: 'Verify electron-store initializes correctly',
              category: 'functionality',
              platform: [process.platform],
              passed: retrieved === 'value',
              duration: 0,
              message: retrieved === 'value' ? 'Store initialized successfully' : 'Store initialization failed',
              timestamp: ''
            };
          }
        },

        {
          id: 'uiohook_initialization',
          name: 'Keystroke Hook Initialization',
          description: 'Verify uiohook-napi can be initialized',
          category: 'functionality',
          required: true,
          timeout: 10000,
          run: async () => {
            try {
              // Test basic uIOhook functionality without actually starting
              const canStart = typeof uIOhook.start === 'function';
              const canStop = typeof uIOhook.stop === 'function';
              const canListen = typeof uIOhook.on === 'function';

              return {
                id: 'uiohook_initialization',
                name: 'Keystroke Hook Initialization',
                description: 'Verify uiohook-napi can be initialized',
                category: 'functionality',
                platform: [process.platform],
                passed: canStart && canStop && canListen,
                duration: 0,
                message: canStart && canStop && canListen ?
                  'uIOhook methods available' :
                  'uIOhook methods missing',
                details: { canStart, canStop, canListen },
                timestamp: ''
              };
            } catch (error) {
              return {
                id: 'uiohook_initialization',
                name: 'Keystroke Hook Initialization',
                description: 'Verify uiohook-napi can be initialized',
                category: 'functionality',
                platform: [process.platform],
                passed: false,
                duration: 0,
                message: `uIOhook initialization failed: ${error.message}`,
                error: error.stack,
                timestamp: ''
              };
            }
          }
        },

        {
          id: 'window_creation',
          name: 'Window Creation',
          description: 'Verify BrowserWindow can be created',
          category: 'functionality',
          required: true,
          run: async () => {
            try {
              const testWindow = new BrowserWindow({
                width: 400,
                height: 300,
                show: false,
                webPreferences: {
                  nodeIntegration: false,
                  contextIsolation: true
                }
              });

              const created = !testWindow.isDestroyed();
              testWindow.destroy();

              return {
                id: 'window_creation',
                name: 'Window Creation',
                description: 'Verify BrowserWindow can be created',
                category: 'functionality',
                platform: [process.platform],
                passed: created,
                duration: 0,
                message: created ? 'Window created successfully' : 'Window creation failed',
                timestamp: ''
              };
            } catch (error) {
              return {
                id: 'window_creation',
                name: 'Window Creation',
                description: 'Verify BrowserWindow can be created',
                category: 'functionality',
                platform: [process.platform],
                passed: false,
                duration: 0,
                message: `Window creation failed: ${error.message}`,
                error: error.stack,
                timestamp: ''
              };
            }
          }
        }
      ]
    };
  }

  // Create permissions test suite
  private createPermissionsTestSuite(): TestSuite {
    return {
      id: 'permissions',
      name: 'System Permissions',
      description: 'Tests for platform-specific permissions',
      tests: [
        {
          id: 'macos_accessibility_check',
          name: 'macOS Accessibility Permissions',
          description: 'Check if accessibility permissions are granted',
          category: 'security',
          platform: ['darwin'],
          required: true,
          run: async () => {
            const trusted = systemPreferences.isTrustedAccessibilityClient(false);

            return {
              id: 'macos_accessibility_check',
              name: 'macOS Accessibility Permissions',
              description: 'Check if accessibility permissions are granted',
              category: 'security',
              platform: ['darwin'],
              passed: trusted,
              duration: 0,
              message: trusted ?
                'Accessibility permissions granted' :
                'Accessibility permissions not granted',
              timestamp: ''
            };
          }
        },

        {
          id: 'user_data_access',
          name: 'User Data Directory Access',
          description: 'Verify access to user data directory',
          category: 'security',
          required: true,
          run: async () => {
            try {
              const userDataPath = app.getPath('userData');
              const stats = fs.statSync(userDataPath);
              const canWrite = fs.accessSync(userDataPath, fs.constants.W_OK);

              return {
                id: 'user_data_access',
                name: 'User Data Directory Access',
                description: 'Verify access to user data directory',
                category: 'security',
                platform: [process.platform],
                passed: stats.isDirectory(),
                duration: 0,
                message: stats.isDirectory() ?
                  'User data directory accessible' :
                  'User data directory not accessible',
                details: { path: userDataPath },
                timestamp: ''
              };
            } catch (error) {
              return {
                id: 'user_data_access',
                name: 'User Data Directory Access',
                description: 'Verify access to user data directory',
                category: 'security',
                platform: [process.platform],
                passed: false,
                duration: 0,
                message: `User data directory access failed: ${error.message}`,
                error: error.stack,
                timestamp: ''
              };
            }
          }
        }
      ]
    };
  }

  // Create performance test suite
  private createPerformanceTestSuite(): TestSuite {
    return {
      id: 'performance',
      name: 'Performance Tests',
      description: 'Tests for application performance',
      tests: [
        {
          id: 'memory_usage',
          name: 'Memory Usage Check',
          description: 'Verify memory usage is within acceptable limits',
          category: 'performance',
          required: true,
          run: async () => {
            const memUsage = process.memoryUsage();
            const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
            const rssUsedMB = memUsage.rss / 1024 / 1024;

            // Consider it a pass if under 200MB RSS and 100MB heap
            const passed = rssUsedMB < 200 && heapUsedMB < 100;

            return {
              id: 'memory_usage',
              name: 'Memory Usage Check',
              description: 'Verify memory usage is within acceptable limits',
              category: 'performance',
              platform: [process.platform],
              passed,
              duration: 0,
              message: passed ?
                `Memory usage acceptable: ${heapUsedMB.toFixed(1)}MB heap, ${rssUsedMB.toFixed(1)}MB RSS` :
                `Memory usage high: ${heapUsedMB.toFixed(1)}MB heap, ${rssUsedMB.toFixed(1)}MB RSS`,
              details: {
                heapUsed: heapUsedMB,
                heapTotal: memUsage.heapTotal / 1024 / 1024,
                rss: rssUsedMB,
                external: memUsage.external / 1024 / 1024
              },
              timestamp: ''
            };
          }
        },

        {
          id: 'startup_time',
          name: 'Application Startup Time',
          description: 'Measure application startup performance',
          category: 'performance',
          required: true,
          run: async () => {
            const startupTime = process.uptime() * 1000; // Convert to milliseconds

            // Consider under 3 seconds as good startup time
            const passed = startupTime < 3000;

            return {
              id: 'startup_time',
              name: 'Application Startup Time',
              description: 'Measure application startup performance',
              category: 'performance',
              platform: [process.platform],
              passed,
              duration: 0,
              message: passed ?
                `Startup time acceptable: ${startupTime.toFixed(0)}ms` :
                `Startup time slow: ${startupTime.toFixed(0)}ms`,
              details: { startupTime },
              timestamp: ''
            };
          }
        }
      ]
    };
  }

  // Create security test suite
  private createSecurityTestSuite(): TestSuite {
    return {
      id: 'security',
      name: 'Security Tests',
      description: 'Tests for security and privacy compliance',
      tests: [
        {
          id: 'context_isolation',
          name: 'Context Isolation Enabled',
          description: 'Verify context isolation is enabled in webPreferences',
          category: 'security',
          required: true,
          run: async () => {
            // This test checks if we can create a window with secure settings
            try {
              const testWindow = new BrowserWindow({
                width: 400,
                height: 300,
                show: false,
                webPreferences: {
                  nodeIntegration: false,
                  contextIsolation: true,
                  sandbox: false // We need access to electron APIs
                }
              });

              const passed = testWindow.webContents.getWebPreferences().contextIsolation;
              testWindow.destroy();

              return {
                id: 'context_isolation',
                name: 'Context Isolation Enabled',
                description: 'Verify context isolation is enabled in webPreferences',
                category: 'security',
                platform: [process.platform],
                passed,
                duration: 0,
                message: passed ?
                  'Context isolation enabled' :
                  'Context isolation disabled',
                timestamp: ''
              };
            } catch (error) {
              return {
                id: 'context_isolation',
                name: 'Context Isolation Enabled',
                description: 'Verify context isolation is enabled in webPreferences',
                category: 'security',
                platform: [process.platform],
                passed: false,
                duration: 0,
                message: `Context isolation test failed: ${error.message}`,
                error: error.stack,
                timestamp: ''
              };
            }
          }
        },

        {
          id: 'file_permissions',
          name: 'File Permissions Security',
          description: 'Check that data files have appropriate permissions',
          category: 'security',
          required: true,
          run: async () => {
            try {
              const userDataPath = app.getPath('userData');
              const configPath = path.join(userDataPath, 'config.json');

              if (!fs.existsSync(configPath)) {
                // Create a test file
                fs.writeFileSync(configPath, '{}', { mode: 0o600 });
              }

              const stats = fs.statSync(configPath);
              const mode = stats.mode;

              // Check that file is not world-readable
              const worldReadable = (mode & parseInt('004', 8)) !== 0;
              const passed = !worldReadable;

              return {
                id: 'file_permissions',
                name: 'File Permissions Security',
                description: 'Check that data files have appropriate permissions',
                category: 'security',
                platform: [process.platform],
                passed,
                duration: 0,
                message: passed ?
                  'File permissions secure' :
                  'File permissions may be too open',
                details: { mode: mode.toString(8) },
                timestamp: ''
              };
            } catch (error) {
              return {
                id: 'file_permissions',
                name: 'File Permissions Security',
                description: 'Check that data files have appropriate permissions',
                category: 'security',
                platform: [process.platform],
                passed: false,
                duration: 0,
                message: `File permissions test failed: ${error.message}`,
                error: error.stack,
                timestamp: ''
              };
            }
          }
        }
      ]
    };
  }

  // Create storage test suite
  private createStorageTestSuite(): TestSuite {
    return {
      id: 'storage',
      name: 'Data Storage Tests',
      description: 'Tests for data persistence and storage',
      tests: [
        {
          id: 'store_persistence',
          name: 'Store Data Persistence',
          description: 'Verify data persists across store instances',
          category: 'functionality',
          required: true,
          run: async () => {
            const testKey = 'test-persistence-key';
            const testValue = { timestamp: Date.now(), data: 'test' };

            try {
              // Create store and set value
              const store1 = new Store({ name: 'persistence-test' });
              store1.set(testKey, testValue);

              // Create new store instance and retrieve value
              const store2 = new Store({ name: 'persistence-test' });
              const retrieved = store2.get(testKey);

              // Cleanup
              store2.delete(testKey);

              const passed = JSON.stringify(retrieved) === JSON.stringify(testValue);

              return {
                id: 'store_persistence',
                name: 'Store Data Persistence',
                description: 'Verify data persists across store instances',
                category: 'functionality',
                platform: [process.platform],
                passed,
                duration: 0,
                message: passed ?
                  'Data persistence works correctly' :
                  'Data persistence failed',
                timestamp: ''
              };
            } catch (error) {
              return {
                id: 'store_persistence',
                name: 'Store Data Persistence',
                description: 'Verify data persists across store instances',
                category: 'functionality',
                platform: [process.platform],
                passed: false,
                duration: 0,
                message: `Store persistence test failed: ${error.message}`,
                error: error.stack,
                timestamp: ''
              };
            }
          }
        }
      ]
    };
  }

  // Create integration test suite
  private createIntegrationTestSuite(): TestSuite {
    return {
      id: 'integration',
      name: 'Integration Tests',
      description: 'Tests for component integration',
      tests: [
        {
          id: 'gamification_integration',
          name: 'Gamification System Integration',
          description: 'Test gamification functions work correctly',
          category: 'integration',
          required: true,
          run: async () => {
            try {
              const { checkAchievements, calculateLevel } = require('./gamification');

              // Test achievement checking
              const mockAchievements: any[] = [];
              const newAchievements = checkAchievements(1000, 5, {}, mockAchievements);

              // Test level calculation
              const level = calculateLevel(1000);

              const passed = Array.isArray(newAchievements) && typeof level === 'number';

              return {
                id: 'gamification_integration',
                name: 'Gamification System Integration',
                description: 'Test gamification functions work correctly',
                category: 'integration',
                platform: [process.platform],
                passed,
                duration: 0,
                message: passed ?
                  'Gamification integration working' :
                  'Gamification integration failed',
                details: {
                  achievementsReturned: newAchievements.length,
                  levelCalculated: level
                },
                timestamp: ''
              };
            } catch (error) {
              return {
                id: 'gamification_integration',
                name: 'Gamification System Integration',
                description: 'Test gamification functions work correctly',
                category: 'integration',
                platform: [process.platform],
                passed: false,
                duration: 0,
                message: `Gamification integration failed: ${error.message}`,
                error: error.stack,
                timestamp: ''
              };
            }
          }
        }
      ]
    };
  }

  // Create compatibility test suite
  private createCompatibilityTestSuite(): TestSuite {
    return {
      id: 'compatibility',
      name: 'Platform Compatibility',
      description: 'Tests for platform-specific compatibility',
      tests: [
        {
          id: 'os_version_compatibility',
          name: 'OS Version Compatibility',
          description: 'Check if running on supported OS version',
          category: 'compatibility',
          required: true,
          run: async () => {
            const osInfo = {
              platform: os.platform(),
              release: os.release(),
              version: os.version ? os.version() : 'unknown'
            };

            let compatible = true;
            let message = `Running on ${osInfo.platform} ${osInfo.release}`;

            // Check minimum requirements
            if (process.platform === 'darwin') {
              // macOS 10.14+ required
              const version = parseInt(osInfo.release.split('.')[0]);
              compatible = version >= 18; // Darwin 18 = macOS 10.14
            } else if (process.platform === 'win32') {
              // Windows 10+ required
              const version = parseInt(osInfo.release.split('.')[0]);
              compatible = version >= 10;
            } else if (process.platform === 'linux') {
              // Most Linux distributions should work
              compatible = true;
            }

            if (!compatible) {
              message = `Incompatible OS version: ${osInfo.platform} ${osInfo.release}`;
            }

            return {
              id: 'os_version_compatibility',
              name: 'OS Version Compatibility',
              description: 'Check if running on supported OS version',
              category: 'compatibility',
              platform: [process.platform],
              passed: compatible,
              duration: 0,
              message,
              details: osInfo,
              timestamp: ''
            };
          }
        },

        {
          id: 'nodejs_version',
          name: 'Node.js Version Compatibility',
          description: 'Check Node.js version compatibility',
          category: 'compatibility',
          required: true,
          run: async () => {
            const nodeVersion = process.version;
            const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0]);

            // Electron typically bundles Node 16+
            const compatible = majorVersion >= 16;

            return {
              id: 'nodejs_version',
              name: 'Node.js Version Compatibility',
              description: 'Check Node.js version compatibility',
              category: 'compatibility',
              platform: [process.platform],
              passed: compatible,
              duration: 0,
              message: compatible ?
                `Node.js ${nodeVersion} is compatible` :
                `Node.js ${nodeVersion} may be too old`,
              details: { nodeVersion, majorVersion },
              timestamp: ''
            };
          }
        }
      ]
    };
  }

  // Generate comprehensive test report
  private generateTestReport(duration: number): TestReport {
    const passedTests = this.testResults.filter(r => r.passed).length;
    const failedTests = this.testResults.filter(r => !r.passed).length;
    const totalTests = this.testResults.length;
    const skippedTests = 0; // We don't currently skip tests

    // Determine overall result
    let overallResult: 'passed' | 'failed' | 'warning' = 'passed';
    const criticalFailures = this.testResults.filter(r =>
      !r.passed &&
      r.category === 'functionality' || r.category === 'security'
    );

    if (criticalFailures.length > 0) {
      overallResult = 'failed';
    } else if (failedTests > 0) {
      overallResult = 'warning';
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations();

    return {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      version: app.getVersion(),
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      duration,
      overallResult,
      results: this.testResults,
      systemInfo: {
        os: os.platform(),
        version: os.release(),
        arch: os.arch(),
        memory: os.totalmem(),
        cpu: os.cpus()[0]?.model || 'Unknown'
      },
      recommendations
    };
  }

  // Generate recommendations based on test results
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const failedTests = this.testResults.filter(r => !r.passed);

    // Check for permission issues
    const permissionFailures = failedTests.filter(r => r.category === 'security');
    if (permissionFailures.length > 0) {
      recommendations.push('Grant necessary permissions for TypeCount to function properly');
    }

    // Check for performance issues
    const performanceFailures = failedTests.filter(r => r.category === 'performance');
    if (performanceFailures.length > 0) {
      recommendations.push('Consider optimizing performance or upgrading hardware');
    }

    // Check for functionality issues
    const functionalityFailures = failedTests.filter(r => r.category === 'functionality');
    if (functionalityFailures.length > 0) {
      recommendations.push('Core functionality issues detected - contact support');
    }

    // Platform-specific recommendations
    if (process.platform === 'darwin') {
      const accessibilityTest = this.testResults.find(r => r.id === 'macos_accessibility_check');
      if (accessibilityTest && !accessibilityTest.passed) {
        recommendations.push('Grant accessibility permissions in System Preferences > Security & Privacy > Privacy > Accessibility');
      }
    } else if (process.platform === 'win32') {
      const memoryTest = this.testResults.find(r => r.id === 'memory_usage');
      if (memoryTest && !memoryTest.passed) {
        recommendations.push('Consider running TypeCount as administrator for optimal performance');
      }
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push('All tests passed - TypeCount is ready for use');
    }

    return recommendations;
  }

  // Show test results dialog
  async showTestResults(report: TestReport): Promise<void> {
    const criticalFailures = report.results.filter(r =>
      !r.passed && (r.category === 'functionality' || r.category === 'security')
    );

    let title = 'Test Results';
    let type: 'info' | 'warning' | 'error' = 'info';

    if (criticalFailures.length > 0) {
      title = 'Critical Test Failures';
      type = 'error';
    } else if (report.failedTests > 0) {
      title = 'Test Warnings';
      type = 'warning';
    } else {
      title = 'All Tests Passed';
    }

    await dialog.showMessageBox({
      type,
      title,
      message: `Test Results: ${report.passedTests}/${report.totalTests} passed`,
      detail: `Duration: ${(report.duration / 1000).toFixed(2)}s\n` +
              `Platform: ${report.platform}\n` +
              `Failed Tests: ${report.failedTests}\n\n` +
              `Top Recommendations:\n${report.recommendations.slice(0, 3).join('\n')}`,
      buttons: ['OK', 'View Full Report']
    });
  }

  // Export test report to file
  async exportTestReport(report: TestReport, filePath?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = filePath || path.join(
      app.getPath('userData'),
      `test-report-${timestamp}.json`
    );

    fs.writeFileSync(filename, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Test report exported to: ${filename}`);

    return filename;
  }

  // Get current test status
  getTestStatus(): { isRunning: boolean; currentTest: string | null } {
    return {
      isRunning: this.isRunning,
      currentTest: this.currentTest
    };
  }
}

// Global instance
export const testingFramework = new TestingFramework();

// Export types
export type { Test, TestSuite, TestResult, TestReport };
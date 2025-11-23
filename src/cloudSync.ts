// Cloud sync functionality using Supabase
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

// Cloud sync configuration
interface CloudSyncConfig {
  enabled: boolean;
  supabaseUrl?: string;
  supabaseKey?: string;
  userId?: string;
  lastSync?: string;
  autoSync?: boolean;
  syncInterval?: number; // hours
}

// User typing data structure for cloud storage
interface CloudUserData {
  user_id: string;
  device_id: string;
  total_keystrokes: number;
  daily_keystrokes: Record<string, number>;
  hourly_keystrokes: Record<string, number[]>;
  achievements: string[];
  challenges: any[];
  goals: any[];
  user_level: number;
  user_xp: number;
  personality_type: string;
  streak_days: number;
  longest_streak: number;
  first_used_date: string;
  last_active_date?: string;
  last_updated: string;
  device_name?: string;
}

class CloudSyncService {
  private supabase: SupabaseClient | null = null;
  private config: CloudSyncConfig = { enabled: false };
  private currentUser: User | null = null;
  private deviceId: string;

  constructor() {
    // Generate unique device ID
    this.deviceId = this.getOrCreateDeviceId();
  }

  // Initialize cloud sync with configuration
  async initialize(config: CloudSyncConfig): Promise<boolean> {
    try {
      if (!config.enabled || !config.supabaseUrl || !config.supabaseKey) {
        this.config = { enabled: false };
        return false;
      }

      this.config = config;
      this.supabase = createClient(config.supabaseUrl, config.supabaseKey);

      // Check if user is already authenticated
      const { data: { user } } = await this.supabase.auth.getUser();
      this.currentUser = user;

      console.log('Cloud sync initialized:', { enabled: config.enabled, authenticated: !!user });
      return true;
    } catch (error) {
      console.error('Failed to initialize cloud sync:', error);
      this.config = { enabled: false };
      return false;
    }
  }

  // Check if cloud sync is enabled and ready
  isEnabled(): boolean {
    return this.config.enabled && !!this.supabase;
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.currentUser;
  }

  // Get current user info
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  // Sign up new user (optional)
  async signUp(email: string, password: string): Promise<{ user: User | null; error: any }> {
    if (!this.supabase) {
      return { user: null, error: 'Cloud sync not initialized' };
    }

    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password
      });

      if (data.user) {
        this.currentUser = data.user;
      }

      return { user: data.user, error };
    } catch (error) {
      console.error('Sign up failed:', error);
      return { user: null, error };
    }
  }

  // Sign in existing user (optional)
  async signIn(email: string, password: string): Promise<{ user: User | null; error: any }> {
    if (!this.supabase) {
      return { user: null, error: 'Cloud sync not initialized' };
    }

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (data.user) {
        this.currentUser = data.user;
      }

      return { user: data.user, error };
    } catch (error) {
      console.error('Sign in failed:', error);
      return { user: null, error };
    }
  }

  // Sign out user
  async signOut(): Promise<{ error: any }> {
    if (!this.supabase) {
      return { error: 'Cloud sync not initialized' };
    }

    try {
      const { error } = await this.supabase.auth.signOut();
      this.currentUser = null;
      return { error };
    } catch (error) {
      console.error('Sign out failed:', error);
      return { error };
    }
  }

  // Backup local data to cloud
  async backupData(localData: any): Promise<{ success: boolean; error?: any }> {
    if (!this.isEnabled() || !this.isAuthenticated()) {
      return { success: false, error: 'Not authenticated or cloud sync disabled' };
    }

    try {
      const cloudData: CloudUserData = {
        user_id: this.currentUser!.id,
        device_id: this.deviceId,
        total_keystrokes: localData.totalKeystrokes || 0,
        daily_keystrokes: localData.dailyKeystrokes || {},
        hourly_keystrokes: localData.hourlyKeystrokes || {},
        achievements: localData.achievements || [],
        challenges: localData.challenges || [],
        goals: localData.goals || [],
        user_level: localData.userLevel || 1,
        user_xp: localData.userXP || 0,
        personality_type: localData.personalityType || '',
        streak_days: localData.streakDays || 0,
        longest_streak: localData.longestStreak || 0,
        first_used_date: localData.firstUsedDate || new Date().toISOString(),
        last_active_date: localData.lastActiveDate,
        last_updated: new Date().toISOString(),
        device_name: await this.getDeviceName()
      };

      const { error } = await this.supabase!
        .from('user_typing_data')
        .upsert(cloudData, { onConflict: 'user_id,device_id' });

      if (error) {
        throw error;
      }

      // Update last sync time
      this.config.lastSync = new Date().toISOString();

      return { success: true };
    } catch (error) {
      console.error('Backup failed:', error);
      return { success: false, error };
    }
  }

  // Restore data from cloud
  async restoreData(): Promise<{ success: boolean; data?: any; error?: any }> {
    if (!this.isEnabled() || !this.isAuthenticated()) {
      return { success: false, error: 'Not authenticated or cloud sync disabled' };
    }

    try {
      const { data, error } = await this.supabase!
        .from('user_typing_data')
        .select('*')
        .eq('user_id', this.currentUser!.id)
        .order('last_updated', { ascending: false });

      if (error) {
        throw error;
      }

      return { success: true, data: data || [] };
    } catch (error) {
      console.error('Restore failed:', error);
      return { success: false, error };
    }
  }

  // Merge local and cloud data with conflict resolution
  async syncData(localData: any): Promise<{ success: boolean; mergedData?: any; error?: any }> {
    if (!this.isEnabled() || !this.isAuthenticated()) {
      return { success: false, error: 'Not authenticated or cloud sync disabled' };
    }

    try {
      // Get cloud data
      const { success, data: cloudDataArray, error } = await this.restoreData();

      if (!success) {
        return { success: false, error };
      }

      // Merge data from all devices
      const mergedData = this.mergeMultiDeviceData(localData, cloudDataArray || []);

      // Backup merged data
      const backupResult = await this.backupData(mergedData);

      if (!backupResult.success) {
        return { success: false, error: backupResult.error };
      }

      return { success: true, mergedData };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, error };
    }
  }

  // Merge data from multiple devices
  private mergeMultiDeviceData(localData: any, cloudDataArray: CloudUserData[]): any {
    let mergedData = { ...localData };

    for (const deviceData of cloudDataArray) {
      // Merge total keystrokes (use maximum)
      mergedData.totalKeystrokes = Math.max(
        mergedData.totalKeystrokes || 0,
        deviceData.total_keystrokes || 0
      );

      // Merge daily keystrokes (sum for each day)
      for (const [date, count] of Object.entries(deviceData.daily_keystrokes || {})) {
        mergedData.dailyKeystrokes[date] = Math.max(
          mergedData.dailyKeystrokes[date] || 0,
          count as number
        );
      }

      // Merge hourly keystrokes (sum for each hour)
      for (const [date, hours] of Object.entries(deviceData.hourly_keystrokes || {})) {
        if (!mergedData.hourlyKeystrokes[date]) {
          mergedData.hourlyKeystrokes[date] = new Array(24).fill(0);
        }
        for (let i = 0; i < 24; i++) {
          mergedData.hourlyKeystrokes[date][i] = Math.max(
            mergedData.hourlyKeystrokes[date][i] || 0,
            (hours as number[])[i] || 0
          );
        }
      }

      // Merge achievements (union)
      const existingAchievements = new Set(mergedData.achievements || []);
      for (const achievement of deviceData.achievements || []) {
        existingAchievements.add(achievement);
      }
      mergedData.achievements = Array.from(existingAchievements);

      // Use highest level and XP
      mergedData.userLevel = Math.max(mergedData.userLevel || 1, deviceData.user_level || 1);
      mergedData.userXP = Math.max(mergedData.userXP || 0, deviceData.user_xp || 0);

      // Use longest streak
      mergedData.longestStreak = Math.max(
        mergedData.longestStreak || 0,
        deviceData.longest_streak || 0
      );

      // Use earliest first used date
      if (deviceData.first_used_date) {
        mergedData.firstUsedDate = mergedData.firstUsedDate
          ? new Date(Math.min(
              new Date(mergedData.firstUsedDate).getTime(),
              new Date(deviceData.first_used_date).getTime()
            )).toISOString()
          : deviceData.first_used_date;
      }
      
      // Merge last active date (use most recent)
      if (deviceData.last_active_date) {
        const currentLastActive = mergedData.lastActiveDate;
        const cloudDate = new Date(deviceData.last_active_date);
        const localDate = currentLastActive ? new Date(currentLastActive) : new Date(0);

        if (cloudDate > localDate) {
          // Cloud has newer activity, trust its streak state
          mergedData.lastActiveDate = deviceData.last_active_date;
          mergedData.streakDays = deviceData.streak_days || 0;
        } else if (cloudDate.getTime() === localDate.getTime()) {
          // Same day activity: user might have synced a higher streak from another device today
          // so we take the maximum to prevent accidental resets
          mergedData.streakDays = Math.max(mergedData.streakDays || 0, deviceData.streak_days || 0);
        }
      }
    }

    // Recalculate total based on merged data
    mergedData.totalKeystrokes = Object.values(mergedData.dailyKeystrokes || {})
      .reduce((sum: number, count: any) => sum + (count || 0), 0);

    // --- Recalculate XP and Level ---
    // This ensures XP is consistent with stats while preserving extra XP from challenges
    
    // 1. Calculate base XP from merged stats (1 XP per 100 keys, 250 XP per achievement)
    const keystrokeXP = Math.floor(mergedData.totalKeystrokes / 100);
    const achievementXP = (mergedData.achievements || []).length * 250;
    const calculatedBaseXP = keystrokeXP + achievementXP;

    // 2. Find maximum XP reported by any device (including local)
    let maxReportedXP = localData.userXP || 0;
    for (const deviceData of cloudDataArray) {
      maxReportedXP = Math.max(maxReportedXP, deviceData.user_xp || 0);
    }

    // 3. Use the higher value.
    // This fixes "0 XP" bugs (calculatedBaseXP will be > 0)
    // And preserves Challenge XP (maxReportedXP will be > calculatedBaseXP)
    mergedData.userXP = Math.max(calculatedBaseXP, maxReportedXP);

    // 4. Update Level based on new XP
    // Level = sqrt(XP / 1000) + 1
    mergedData.userLevel = Math.min(Math.floor(Math.sqrt(mergedData.userXP / 1000)) + 1, 100);

    return mergedData;
  }

  // Get or create unique device ID
  private getOrCreateDeviceId(): string {
    const stored = localStorage.getItem('typecount-device-id');
    if (stored) {
      return stored;
    }

    const newId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('typecount-device-id', newId);
    return newId;
  }

  // Get friendly device name
  private async getDeviceName(): Promise<string> {
    const platform = navigator.platform;
    const userAgent = navigator.userAgent;

    let deviceName = 'Unknown Device';

    if (platform.includes('Mac')) {
      deviceName = 'Mac';
    } else if (platform.includes('Win')) {
      deviceName = 'Windows PC';
    } else if (platform.includes('Linux')) {
      deviceName = 'Linux PC';
    }

    // Add timestamp for uniqueness
    return `${deviceName} (${new Date().toLocaleDateString()})`;
  }

  // Check if sync is needed (based on time interval)
  shouldSync(): boolean {
    if (!this.isEnabled() || !this.config.autoSync) {
      return false;
    }

    if (!this.config.lastSync) {
      return true;
    }

    const lastSyncTime = new Date(this.config.lastSync).getTime();
    const now = Date.now();
    const intervalMs = (this.config.syncInterval || 24) * 60 * 60 * 1000; // hours to ms

    return now - lastSyncTime >= intervalMs;
  }

  // Get sync configuration
  getConfig(): CloudSyncConfig {
    return { ...this.config };
  }

  // Update sync configuration
  updateConfig(newConfig: Partial<CloudSyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Diagnostic: Check connection to Supabase
  async checkConnection(): Promise<{ success: boolean; error?: any }> {
    if (!this.supabase) {
      return { success: false, error: 'Supabase client not initialized' };
    }

    try {
      // Try to hit the table. Even a 401/403 error means we Connected to the server.
      const { count, error } = await this.supabase
        .from('user_typing_data')
        .select('*', { count: 'exact', head: true });

      if (error) {
        // 42501 means "Permission Denied" (RLS), which means we DID connect and the table DOES exist!
        if (error.code === '42501') {
          return { success: true }; 
        }
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }
}

// Singleton instance
export const cloudSync = new CloudSyncService();
export type { CloudSyncConfig, CloudUserData };
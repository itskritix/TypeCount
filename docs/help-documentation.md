# TypeCount Help Documentation

## Table of Contents
1. [Getting Started](#getting-started)
2. [Privacy & Security](#privacy--security)
3. [Features Overview](#features-overview)
4. [Troubleshooting](#troubleshooting)
5. [FAQ](#frequently-asked-questions)
6. [Cloud Sync Setup](#cloud-sync-setup)
7. [Data Management](#data-management)
8. [Keyboard Shortcuts](#keyboard-shortcuts)
9. [Performance Tips](#performance-tips)
10. [Support](#support)

---

## Getting Started

### First Launch
When you first launch TypeCount, you'll be guided through a setup process that includes:

1. **Privacy Agreement**: Understanding what data TypeCount collects
2. **Permission Setup**: Granting necessary permissions for keystroke monitoring
3. **Feature Introduction**: Learning about TypeCount's capabilities
4. **Optional Cloud Setup**: Configuring cloud sync if desired

### System Requirements
- **macOS**: 10.14 (Mojave) or later
- **Windows**: 10 or later (64-bit)
- **Linux**: Ubuntu 18.04 LTS or equivalent
- **Memory**: 100 MB RAM
- **Storage**: 50 MB available space

### Installation
1. Download TypeCount from the official website
2. Run the installer for your platform
3. Follow the on-screen setup instructions
4. Grant necessary permissions when prompted

---

## Privacy & Security

### What Data Does TypeCount Collect?

**TypeCount ONLY collects:**
- ✅ Number of keystrokes (count only)
- ✅ Daily and hourly keystroke statistics
- ✅ Achievement and goal progress
- ✅ App preferences and settings

**TypeCount NEVER collects:**
- ❌ Actual keystroke content (what you type)
- ❌ Passwords or sensitive text
- ❌ Screenshots or screen content
- ❌ Personal files or documents
- ❌ Browsing history or web activity

### Data Storage
- **Local Storage**: All data is stored locally on your device by default
- **Cloud Storage**: Optional, requires explicit setup and consent
- **Encryption**: Cloud sync data is encrypted in transit
- **Location**: Data stored in OS-protected user directories

### Privacy Controls
- View all collected data in Settings > Privacy
- Export your data anytime in JSON or CSV format
- Delete all data with one click
- Disable cloud sync without losing local data
- Revoke permissions anytime through system settings

---

## Features Overview

### Real-Time Analytics
- **Live Counter**: See your keystroke count update in real-time
- **Daily Progress**: Track today's typing activity
- **Session Stats**: Monitor current session performance
- **Productivity Insights**: Understand your peak typing hours

### Achievement System
TypeCount includes 25+ achievements across 5 categories:

#### Milestone Achievements
- First Steps (1 keystroke)
- Getting Started (100 keystrokes)
- Warming Up (1,000 keystrokes)
- Productive Day (10,000 keystrokes)
- Speed Demon (50,000 keystrokes)
- Typing Master (100,000 keystrokes)

#### Streak Achievements
- Daily Habit (7-day streak)
- Committed (30-day streak)
- Dedicated (100-day streak)
- Unstoppable (365-day streak)

#### Time-Based Achievements
- Early Bird (typing before 6 AM)
- Night Owl (typing after 10 PM)
- Marathon Session (5+ consecutive hours)

#### Challenge Achievements
- Daily Target Achiever
- Weekly Goal Crusher
- Consistency Champion

#### Special Achievements
- First Week Complete
- Perfect Month
- Century Club (100+ days)

### Challenges & Goals
- **Daily Challenges**: Automatically generated based on your patterns
- **Weekly Challenges**: Long-term goals to maintain motivation
- **Custom Goals**: Set your own daily, weekly, or monthly targets
- **Progress Tracking**: Visual indicators and completion celebrations

### Personality Insights
TypeCount analyzes your typing patterns to provide personality insights:
- **Early Bird**: Most active in morning hours
- **Night Owl**: Peak activity in evening/night
- **Steady Pacer**: Consistent activity throughout the day
- **Sprint Typist**: Intense bursts of activity
- **Marathon Typist**: Long, sustained sessions

### Gamification Features
- **Experience Points (XP)**: Earn XP for every keystroke
- **Leveling System**: Progress through 50+ levels
- **Streak Bonuses**: Extra XP for consecutive days
- **Challenge Rewards**: Bonus XP for completing challenges
- **Celebrations**: Animated rewards for achievements

---

## Troubleshooting

### Common Issues

#### TypeCount isn't counting keystrokes

**macOS:**
1. Check accessibility permissions:
   - System Preferences → Security & Privacy → Privacy → Accessibility
   - Ensure TypeCount is listed and checked
   - If not listed, click the lock to unlock, then add TypeCount

2. Restart TypeCount after granting permissions

3. If issues persist, try restarting your Mac

**Windows:**
1. Run TypeCount as Administrator:
   - Right-click TypeCount icon
   - Select "Run as administrator"

2. Check Windows Defender or antivirus software:
   - Add TypeCount to exclusions list
   - Some security software may block keystroke monitoring

3. Ensure TypeCount is in the system tray:
   - Look for the TypeCount icon in the notification area
   - If missing, launch TypeCount from Start menu

**Linux:**
1. Check if X11 or Wayland is supported
2. Install required dependencies for your distribution
3. Ensure TypeCount has necessary permissions

#### TypeCount is consuming too much memory

1. **Check for memory leaks**:
   - Open Settings → Performance
   - View current memory usage
   - If over 200MB, restart TypeCount

2. **Reduce data retention**:
   - Settings → Data Management
   - Reduce history retention period
   - Clean up old data

3. **Disable cloud sync temporarily**:
   - Settings → Cloud Sync
   - Turn off automatic sync
   - Manually sync when needed

#### Cloud sync isn't working

1. **Check internet connection**
2. **Verify credentials**:
   - Settings → Cloud Sync
   - Sign out and sign in again
3. **Check Supabase status**:
   - Visit status.supabase.com
4. **Review error logs**:
   - Settings → Advanced → View Logs

#### Dashboard won't open

1. **Check if TypeCount is running**:
   - Look for tray icon
   - If missing, launch from Start menu/Applications

2. **Force refresh**:
   - Right-click tray icon
   - Select "Restart Application"

3. **Clear cache**:
   - Quit TypeCount completely
   - Delete cache files in user data directory
   - Restart TypeCount

### Performance Issues

#### High CPU usage
1. Check achievement checking frequency in Settings
2. Reduce update intervals
3. Disable real-time charts if not needed
4. Restart TypeCount

#### Slow startup
1. Disable startup applications
2. Check for Windows updates
3. Ensure sufficient disk space
4. Run TypeCount as administrator (Windows)

---

## Frequently Asked Questions

### General Questions

**Q: Is TypeCount really free?**
A: Yes, TypeCount is completely free with all features included. No premium tiers, no subscriptions, no hidden costs.

**Q: Does TypeCount work with all applications?**
A: Yes, TypeCount monitors keystrokes system-wide across all applications when proper permissions are granted.

**Q: Can I use TypeCount on multiple devices?**
A: Yes, with cloud sync enabled, you can sync your progress across Windows, Mac, and Linux devices.

**Q: How much data does TypeCount use?**
A: Very little. Cloud sync typically uses less than 1MB per month. Local storage is usually under 10MB.

### Privacy Questions

**Q: Can TypeCount see what I'm typing?**
A: No. TypeCount only counts keystrokes - it never captures, stores, or transmits the actual content of what you type.

**Q: Is my data safe?**
A: Yes. Your data is stored locally by default. Cloud sync uses encryption and you maintain full control over your data.

**Q: Can TypeCount access my passwords?**
A: No. TypeCount cannot see password fields or any typed content - only keystroke counts.

**Q: Does TypeCount track mouse clicks?**
A: No, TypeCount only monitors keyboard activity, not mouse movements or clicks.

**Q: Can employers spy on me with TypeCount?**
A: TypeCount is designed for personal use and doesn't provide surveillance capabilities. It only tracks keystroke counts, not content.

### Technical Questions

**Q: Why does TypeCount need accessibility permissions?**
A: Accessibility permissions allow TypeCount to monitor keystrokes across all applications system-wide.

**Q: Will TypeCount slow down my computer?**
A: No. TypeCount is designed to be lightweight and typically uses less than 50MB of memory.

**Q: Can I export my data?**
A: Yes. Go to Settings → Data Management → Export Data to download your statistics in CSV or JSON format.

**Q: Does TypeCount work offline?**
A: Yes. All core features work offline. Cloud sync requires internet but is completely optional.

**Q: How accurate is TypeCount?**
A: Very accurate. TypeCount captures virtually all keystrokes when proper permissions are granted.

### Feature Questions

**Q: How are achievements unlocked?**
A: Achievements are automatically unlocked when you meet their criteria (keystroke counts, streaks, time patterns, etc.).

**Q: Can I customize challenges?**
A: Currently, challenges are automatically generated based on your patterns. Custom challenges are planned for a future update.

**Q: What happens if I don't use TypeCount for a week?**
A: Your data remains safe. Streaks will reset, but all historical data and achievements are preserved.

**Q: Can I set multiple daily goals?**
A: Currently, you can set one daily goal and one weekly goal. Multiple goals are planned for future updates.

**Q: Do keystrokes from all applications count equally?**
A: Yes, TypeCount treats all keystrokes equally regardless of the source application.

---

## Cloud Sync Setup

### Creating an Account

1. **Open Settings**:
   - Click the tray icon
   - Select "Open Dashboard"
   - Navigate to Settings tab

2. **Enable Cloud Sync**:
   - Click "Cloud Sync" section
   - Click "Enable Cloud Sync"

3. **Create Account**:
   - Enter your email address
   - Create a secure password
   - Click "Create Account"

4. **Verify Email** (if required):
   - Check your email for verification
   - Click the verification link

5. **First Sync**:
   - Click "Backup Data to Cloud"
   - Wait for initial sync to complete

### Managing Cloud Sync

**Manual Backup:**
- Settings → Cloud Sync → "Backup Now"

**Restore from Cloud:**
- Settings → Cloud Sync → "Restore from Cloud"
- Choose device/date to restore from

**Conflict Resolution:**
- TypeCount automatically merges data from multiple devices
- Uses maximum values for keystroke counts
- Combines achievements from all devices
- Preserves the earliest "first used" date

**Signing Out:**
- Settings → Cloud Sync → "Sign Out"
- Local data remains unaffected

### Troubleshooting Cloud Sync

**Sync Failures:**
1. Check internet connection
2. Verify login credentials
3. Check for server status issues
4. Try manual sync instead of automatic

**Data Conflicts:**
1. TypeCount automatically resolves most conflicts
2. Manual resolution may be needed for custom goals
3. Contact support for unresolvable conflicts

**Account Issues:**
1. Reset password if forgotten
2. Contact support for account lockouts
3. Create new account if email is inaccessible

---

## Data Management

### Understanding Your Data

**Keystroke Statistics:**
- Total keystrokes (all-time)
- Daily keystrokes by date
- Hourly breakdown for each day
- Session statistics

**Achievement Data:**
- Unlocked achievements with timestamps
- Progress toward locked achievements
- Achievement categories and descriptions

**Goals & Challenges:**
- Active and completed challenges
- Custom goals and progress
- Historical goal performance

**Settings & Preferences:**
- App configuration
- Theme preferences
- Notification settings
- Auto-launch preferences

### Data Export

1. **Navigate to Data Management**:
   - Settings → Data Management → Export Data

2. **Choose Format**:
   - **JSON**: Complete data with all details
   - **CSV**: Simplified format for spreadsheets

3. **Select Date Range** (optional):
   - All time (default)
   - Last 30 days
   - Last 90 days
   - Custom range

4. **Export Location**:
   - Choose save location
   - File will include timestamp in name

### Data Import

**From Previous TypeCount Installation:**
1. Export data from old installation
2. Install TypeCount on new device
3. Settings → Data Management → Import Data
4. Select exported file
5. Choose merge or replace option

**From Other Applications:**
- Currently, TypeCount only supports importing its own data format
- Contact support for assistance with other formats

### Data Cleanup

**Automatic Cleanup:**
- Old data (>365 days) automatically cleaned
- Crash reports (>30 days) automatically cleaned
- Analytics data (>30 days) automatically cleaned

**Manual Cleanup:**
1. Settings → Data Management → Clean Up Data
2. Choose what to clean:
   - Old keystroke data
   - Completed challenges
   - Crash reports
   - Cache files
3. Confirm cleanup action

**Reset All Data:**
⚠️ **Warning: This action cannot be undone**
1. Settings → Data Management → Reset All Data
2. Confirm action
3. All local data will be deleted
4. Cloud data remains unaffected

---

## Keyboard Shortcuts

### Global Shortcuts
- **Ctrl/Cmd + Shift + T**: Open TypeCount dashboard
- **Ctrl/Cmd + Shift + H**: Hide/Show TypeCount window

### Dashboard Shortcuts
- **F5**: Refresh data
- **Ctrl/Cmd + E**: Export data
- **Ctrl/Cmd + S**: Open settings
- **Ctrl/Cmd + W**: Close dashboard
- **Esc**: Close current dialog/modal

### Tray Icon Shortcuts
- **Left Click**: Open dashboard
- **Right Click**: Context menu
- **Double Click**: Quick stats popup

---

## Performance Tips

### Optimizing TypeCount

1. **Reduce Update Frequency**:
   - Settings → Performance → Update Interval
   - Increase from 250ms to 500ms or 1000ms

2. **Limit Data Retention**:
   - Settings → Data Management → Retention Period
   - Keep 90 days instead of 365 days

3. **Disable Real-time Charts**:
   - Settings → Interface → Real-time Updates
   - Turn off for better performance

4. **Reduce Achievement Checking**:
   - Settings → Performance → Achievement Check Interval
   - Increase from every 100 to every 500 keystrokes

### System Optimization

1. **Close Unnecessary Applications**:
   - Free up system memory
   - Reduce CPU competition

2. **Regular Restarts**:
   - Restart TypeCount weekly
   - Restart system for optimal performance

3. **Keep Updated**:
   - Enable auto-updates
   - Check for updates monthly

### Storage Management

1. **Regular Exports**:
   - Export data monthly
   - Store backups externally

2. **Clean Temporary Files**:
   - Settings → Data Management → Clean Temp Files
   - Run weekly

3. **Monitor Disk Space**:
   - Ensure at least 1GB free space
   - TypeCount needs space for temporary operations

---

## Support

### Getting Help

**Documentation:**
- This help file contains most answers
- Check FAQ section first
- Search documentation for keywords

**Community Support:**
- GitHub Issues: Report bugs and feature requests
- Discord Community: Chat with other users
- Reddit: r/TypeCount for discussions

**Direct Support:**
- Email: support@typecount.app
- Response time: 24-48 hours
- Include system info and error logs

### Reporting Bugs

**Information to Include:**
1. **System Information**:
   - Operating system and version
   - TypeCount version
   - Hardware specifications

2. **Bug Description**:
   - What were you doing when the bug occurred?
   - What did you expect to happen?
   - What actually happened?

3. **Steps to Reproduce**:
   - Detailed steps to recreate the issue
   - Frequency of occurrence

4. **Logs and Screenshots**:
   - Settings → Advanced → Export Logs
   - Screenshots if applicable

**Bug Report Template:**
```
**System Info:**
- OS: [Windows 11 / macOS 12.6 / Ubuntu 20.04]
- TypeCount Version: [1.0.0]
- Hardware: [Brief description]

**Description:**
[Clear description of the bug]

**Steps to Reproduce:**
1. [First step]
2. [Second step]
3. [And so on...]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Additional Context:**
[Any other relevant information]
```

### Feature Requests

**How to Submit:**
1. Check existing feature requests first
2. Use GitHub Issues with "Feature Request" label
3. Provide detailed description and use cases
4. Include mockups or examples if helpful

**Popular Requested Features:**
- Application-specific tracking
- Team/organization features
- Additional export formats
- Custom challenge creation
- Advanced filtering and analytics

### Contact Information

- **Website**: https://typecount.app
- **Email**: support@typecount.app
- **GitHub**: https://github.com/itskritix/TypeCount
- **Discord**: https://discord.gg/typecount
- **Twitter**: @TypeCountApp

---

*This documentation was last updated: November 2024*
*TypeCount Version: 1.0.0*
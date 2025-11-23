# Keystroke Count Discrepancy Bug Analysis

## Issue Report
**Reported Behavior**: App shows 6.7k keystrokes while widget shows 8.7k keystrokes (2k discrepancy)
**Suspected Cause**: Data leak or synchronization issue
**Severity**: High - Data integrity issue

---

## Root Cause Analysis

### Primary Bug: Incomplete Cache Refresh After Cloud Sync

**Location**: `/src/main.ts:1668-1673`

#### The Problem
When cloud sync updates user data via the `update-user-data` IPC handler, it only partially refreshes the keystroke tracker cache:

**Before Fix**:
```typescript
if (keystrokeTracker) {
  keystrokeTracker.cachedStats.total = store.get('totalKeystrokes') || 0;
  keystrokeTracker.cachedStats.streak = store.get('streakDays') || 0;
  keystrokeTracker.cachedStats.userLevel = store.get('userLevel') || 1;
  keystrokeTracker.cachedStats.userXP = store.get('userXP') || 0;
  // ❌ MISSING: cachedStats.today is NOT updated!
}
```

#### Why This Causes the Discrepancy

1. **Normal Flow**:
   - User types 8,700 keystrokes locally
   - `cachedStats.today` = 8,700
   - `cachedStats.total` = 8,700

2. **Cloud Sync Occurs**:
   - Cloud has older/conflicting data showing only 6,700 total
   - Merge function recalculates total from daily data → 6,700
   - `update-user-data` handler updates store with merged data

3. **Cache Refresh Bug**:
   - `cachedStats.total` gets updated to 6,700 ✅
   - `cachedStats.today` remains 8,700 ❌ (NOT REFRESHED!)

4. **Result**:
   - Main app reads `cachedStats.total` → shows 6.7k
   - Widget reads `cachedStats.today` → shows 8.7k
   - **2k discrepancy = stale today cache**

#### Data Flow Diagram
```
CLOUD SYNC
    ↓
Merges data → Recalculates totals
    ↓
update-user-data IPC → Updates electron-store
    ↓
Refreshes cache:
  ✅ cache.total = 6,700 (correct)
  ❌ cache.today = 8,700 (STALE - not updated!)
    ↓
Main App: getTodayKeystrokes() → returns cache.total → 6.7k
Widget:   getTodayKeystrokes() → returns cache.today → 8.7k
    ↓
DISCREPANCY: 2k difference
```

---

### Secondary Bug: Redundant Total Calculation

**Location**: `/src/cloudSync.ts:254-257` (removed in fix)

#### The Problem
The merge function performed two conflicting calculations:

**Before Fix**:
```typescript
// First calculation (line 254-257)
mergedData.totalKeystrokes = Math.max(
  mergedData.totalKeystrokes || 0,
  deviceData.total_keystrokes || 0
);

// ...100 lines later...

// Second calculation (line 326) - OVERWRITES THE FIRST!
mergedData.totalKeystrokes = Object.values(mergedData.dailyKeystrokes || {})
  .reduce((sum: number, count: any) => sum + (count || 0), 0);
```

The first calculation is immediately overwritten, serving no purpose and potentially causing confusion.

---

## Fixes Implemented

### Fix #1: Update cache.today After Cloud Sync (PRIMARY FIX)

**File**: `/src/main.ts:1668-1677`

```typescript
if (keystrokeTracker) {
  const today = new Date().toISOString().split('T')[0];
  keystrokeTracker.cachedStats.total = store.get('totalKeystrokes') || 0;
  keystrokeTracker.cachedStats.today = (store.get('dailyKeystrokes') || {})[today] || 0; // ✅ FIXED
  keystrokeTracker.cachedStats.streak = store.get('streakDays') || 0;
  keystrokeTracker.cachedStats.userLevel = store.get('userLevel') || 1;
  keystrokeTracker.cachedStats.userXP = store.get('userXP') || 0;

  console.log(`🔄 Cache refreshed after cloud sync - Total: ${keystrokeTracker.cachedStats.total}, Today: ${keystrokeTracker.cachedStats.today}`);
}
```

**Impact**: Ensures both `total` and `today` caches stay synchronized after cloud sync.

---

### Fix #2: Remove Redundant Total Calculation

**File**: `/src/cloudSync.ts:253-255`

**Before**:
```typescript
// Merge total keystrokes (use maximum)
mergedData.totalKeystrokes = Math.max(
  mergedData.totalKeystrokes || 0,
  deviceData.total_keystrokes || 0
);
```

**After**:
```typescript
// Note: Total keystrokes will be recalculated from daily data later
// to ensure consistency and prevent discrepancies
```

**Impact**: Eliminates confusion and ensures total is always derived from daily data (single source of truth).

---

### Fix #3: Comprehensive Debug Logging

Added logging at 6 critical points to diagnose future issues:

1. **Cloud Sync Merge** (`/src/cloudSync.ts:327`):
   ```typescript
   console.log(`📊 Cloud Sync Merge - Total recalculated: ${oldTotal} → ${mergedData.totalKeystrokes}`);
   ```

2. **Renderer Cloud Sync Start** (`/src/renderer.ts:875`):
   ```typescript
   console.log(`📤 Applying cloud sync results - Total before: ${totalKeystrokes}, Total after: ${result.mergedData.totalKeystrokes}`);
   ```

3. **Data Sent to Main Process** (`/src/renderer.ts:889`):
   ```typescript
   console.log(`💾 Sending merged data to main process - Total: ${result.mergedData.totalKeystrokes}`);
   ```

4. **Main Process Receives Sync** (`/src/main.ts:1653`):
   ```typescript
   console.log(`☁️ Received cloud sync update - Total: ${data.totalKeystrokes}, Daily keys count: ${Object.keys(data.dailyKeystrokes || {}).length}`);
   ```

5. **Cache Refresh After Sync** (`/src/main.ts:1676`):
   ```typescript
   console.log(`🔄 Cache refreshed after cloud sync - Total: ${keystrokeTracker.cachedStats.total}, Today: ${keystrokeTracker.cachedStats.today}`);
   ```

6. **Batch Storage Flush** (`/src/main.ts:358`):
   ```typescript
   console.log(`💾 Flushing ${this.batchedUpdates} keystrokes to storage - Total: ${this.cachedStats.total}, Today: ${this.cachedStats.today}`);
   ```

7. **Widget Updates** (`/src/main.ts:1034`):
   ```typescript
   console.log(`📊 Updating widget - Total: ${widgetData.total}, Today: ${widgetData.today}`);
   ```

8. **Widget Data Requests** (`/src/main.ts:1742`):
   ```typescript
   console.log(`📱 Widget requested data - Total: ${widgetData.total}, Today: ${widgetData.today}`);
   ```

**Impact**: Complete visibility into data flow from sync → cache → widget/app display.

---

## End-to-End Test Plan

### Test Scenario 1: Normal Typing (No Sync)
1. Launch app fresh
2. Type 100 keystrokes
3. **Verify**: App shows 100, Widget shows 100
4. Wait for batch flush (check logs: `💾 Flushing...`)
5. **Verify**: Both still show 100

### Test Scenario 2: Cloud Sync with Higher Local Data
1. Have local data: 8,700 keystrokes
2. Have cloud data: 6,700 keystrokes (simulate older sync)
3. Trigger manual sync
4. **Watch Logs**:
   ```
   📤 Applying cloud sync results - Total before: 8700, Total after: 8700
   💾 Sending merged data to main process - Total: 8700
   ☁️ Received cloud sync update - Total: 8700
   🔄 Cache refreshed after cloud sync - Total: 8700, Today: 8700
   📊 Updating widget - Total: 8700, Today: 8700
   ```
5. **Verify**: App shows 8.7k, Widget shows 8.7k (both match!)

### Test Scenario 3: Cloud Sync with Higher Cloud Data
1. Have local data: 5,000 keystrokes
2. Have cloud data: 7,000 keystrokes (newer from another device)
3. Trigger manual sync
4. **Watch Logs**:
   ```
   📊 Cloud Sync Merge - Total recalculated: 5000 → 7000
   🔄 Cache refreshed after cloud sync - Total: 7000, Today: 3500
   ```
5. **Verify**: App shows 7.0k, Widget shows correct today count

### Test Scenario 4: Widget Refresh After Sync
1. Perform cloud sync (any scenario)
2. Close and reopen widget
3. **Watch Logs**:
   ```
   📱 Widget requested data - Total: XXXX, Today: YYYY
   ```
4. **Verify**: Widget shows same values as main app

### Test Scenario 5: Login Flow Test
1. Sign out if signed in
2. Clear local data (or use fresh install)
3. Sign in with existing account (has cloud data)
4. **Watch Logs** during login:
   ```
   ☁️ Received cloud sync update - Total: XXXX
   🔄 Cache refreshed after cloud sync - Total: XXXX, Today: YYYY
   ```
5. Type 50 new keystrokes
6. **Verify**: Counts update correctly (old + 50)
7. **Verify**: App and widget match

---

## Expected Log Sequence for Full Sync Cycle

```
1. User triggers sync in UI
   📤 Applying cloud sync results - Total before: 8700, Total after: 6700

2. Merge happens in cloud sync module
   📊 Cloud Sync Merge - Total recalculated: 8700 → 6700

3. Renderer sends to main process
   💾 Sending merged data to main process - Total: 6700

4. Main process receives update
   ☁️ Received cloud sync update - Total: 6700, Daily keys count: 45

5. Cache gets refreshed (THE FIX!)
   🔄 Cache refreshed after cloud sync - Total: 6700, Today: 6700

6. Widget updates
   📊 Updating widget - Total: 6700, Today: 6700
```

**Key Indicators of Success**:
- ✅ Total and Today values match in the cache refresh log
- ✅ Widget update shows same values as cache refresh
- ✅ No discrepancy between app and widget displays

---

## Verification Commands

### Check Logs in Real-Time
```bash
# In terminal while app is running
tail -f ~/.config/TypeCount/logs/main.log | grep -E "(📊|🔄|💾|☁️|📱|📤)"
```

### Inspect Storage After Sync
```javascript
// In DevTools Console (main app)
const { ipcRenderer } = require('electron');
ipcRenderer.send('request-data');
ipcRenderer.once('data-response', (event, data) => {
  console.log('Store Total:', data.total);
  console.log('Store Today:', data.today);
  console.log('Daily Data:', data.dailyData);
});
```

---

## Additional Issues Identified (Not Fixed)

### 1. No Data Reset on Logout
**Location**: `/src/renderer.ts:783-799`
**Issue**: Sign out clears cloud session but NOT local keystroke counts
**Risk**: User could have stale data persisting after logout
**Recommendation**: Add `store.clear()` or selective reset on logout

### 2. Multiple "Today" Date Calculations
**Locations**: Lines 356, 591, 596, 1072 in `main.ts`
**Issue**: Different code paths calculate today's date independently
**Risk**: Timezone issues could cause midnight rollover discrepancies
**Recommendation**: Centralize date calculation in a single utility function

### 3. Widget Initial Load Uses Different Path
**Issue**:
- Initial request (line 1735): Reads from `store.get('totalKeystrokes')`
- Subsequent updates (line 1031): Reads from `keystrokeTracker.cachedStats.total`
**Risk**: Widget can show wrong initial value if store and cache are out of sync
**Status**: Mitigated by Fix #1 (cache refresh), but could be improved

---

## Files Changed

1. **`/src/main.ts`**:
   - Line 358: Added batch flush logging
   - Lines 1034, 1669-1677: Cache refresh fix + logging
   - Lines 1653, 1742: Sync and widget logging

2. **`/src/cloudSync.ts`**:
   - Lines 253-255: Removed redundant calculation
   - Line 327: Added merge logging

3. **`/src/renderer.ts`**:
   - Lines 875, 889: Added sync logging

---

## Testing Status

- ✅ Syntax validation passed (all files)
- ⏳ **Requires manual end-to-end testing** (see Test Plan above)
- ⏳ User should verify with actual cloud sync flow

---

## Conclusion

The 2k keystroke discrepancy was caused by incomplete cache refresh after cloud sync. The `cachedStats.today` field was not being recalculated from the updated `dailyKeystrokes` data, causing the widget to show stale values while the main app showed correct merged values.

**Fix Confidence**: High - The root cause is clearly identified and the fix directly addresses the cache refresh logic.

**Recommended Next Steps**:
1. Test login flow with existing cloud account
2. Test manual sync with conflicting data
3. Monitor logs during testing to confirm fix
4. Consider addressing additional issues (logout data reset, centralized date calculation)

---

**Document Version**: 1.0
**Date**: 2025-11-23
**Author**: Claude (Automated Bug Analysis)

# ⚠️ TypeCount - Permissions Setup Guide

## Windows Users - IMPORTANT! 

TypeCount needs **Administrator privileges** to track your keystrokes on Windows. This is required by Windows security to monitor keyboard input.

### How to Run with Administrator Rights:

#### Option 1: Always Run as Administrator (Recommended)
1. Right-click on the **TypeCount** shortcut on your Desktop or Start Menu
2. Select **Properties**
3. Click the **Compatibility** tab
4. Check the box: **"Run this program as an administrator"**
5. Click **Apply** then **OK**
6. Close TypeCount if it's running and restart it

#### Option 2: Run Once as Administrator
1. Right-click on **TypeCount** icon
2. Select **"Run as administrator"**
3. Click **Yes** when Windows asks for permission

### Why Administrator Rights Are Needed:

- Windows protects keyboard input for security reasons
- TypeCount needs low-level keyboard access to count keystrokes
- This is a Windows requirement, not a TypeCount limitation
- Your data stays private and local on your computer

### Security & Privacy:

✅ TypeCount only counts keystrokes, it does NOT record what you type  
✅ All data is stored locally on your computer  
✅ No keystrokes are sent over the internet  
✅ You can verify the code is open-source on GitHub  

---

## macOS Users

On macOS, TypeCount needs **Accessibility permissions** instead of administrator rights.

### How to Grant Accessibility Permission:

1. Open TypeCount (it will show a permission dialog)
2. Click **OK** to open System Settings
3. Go to: **System Settings** → **Privacy & Security** → **Accessibility**
4. Find **TypeCount** in the list
5. Toggle the switch to **ON** (enable)
6. You may need to unlock with your password first (click the lock icon)
7. Restart TypeCount

### Alternative Manual Method:

1. Open **System Settings**
2. Go to **Privacy & Security**
3. Click on **Accessibility**
4. Click the **+** button
5. Navigate to **Applications** and select **TypeCount**
6. Enable the checkbox next to TypeCount

---

## Linux Users

On Linux, TypeCount works without special permissions in most cases. However, you may need:

### If using Wayland:
```bash
# Run with X11 compatibility
GDK_BACKEND=x11 typecount
```

### If permissions are needed:
```bash
# Add your user to input group
sudo usermod -a -G input $USER
# Log out and log back in
```

---

## Troubleshooting

### Windows: "Keystrokes not counting"
- ❌ **Problem**: Not running with admin rights
- ✅ **Solution**: Follow "Option 1" above to always run as admin

### Windows: "Shield icon appears when launching"
- ✅ **This is normal** - Windows shows this when apps need admin rights
- ✅ Click "Yes" to allow TypeCount to run

### macOS: "Permission denied" or not counting
- ❌ **Problem**: Accessibility permission not granted
- ✅ **Solution**: Grant permission in System Settings (see above)

### All Platforms: Still not working?
1. **Restart the app** completely (quit and reopen)
2. **Check the logs**: Look for error messages in the app
3. **Reinstall**: Download the latest version
4. **Report**: Create an issue on GitHub with your OS version

---

## First Time Setup Checklist

### Windows:
- [ ] Install TypeCount
- [ ] Set to "Run as administrator" (see Option 1 above)
- [ ] Restart TypeCount
- [ ] Verify keystrokes are being counted

### macOS:
- [ ] Install TypeCount
- [ ] Open TypeCount
- [ ] Grant Accessibility permission
- [ ] Restart TypeCount
- [ ] Verify keystrokes are being counted

### Linux:
- [ ] Install TypeCount
- [ ] Open TypeCount
- [ ] If needed, add user to input group
- [ ] Verify keystrokes are being counted

---

## Need Help?

- 📖 **Documentation**: Check BUILD.md and README.md
- 🐛 **Report Issues**: https://github.com/itskritix/TypeCount/issues
- 💬 **Questions**: Open a discussion on GitHub

---

**Remember**: TypeCount respects your privacy. Administrator/Accessibility permissions are only used to count keystrokes, not record them. Your typing data never leaves your computer unless you explicitly enable cloud sync.

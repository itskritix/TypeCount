# TypeCount - Quick Build & Release Guide

## ✅ What's Been Set Up

Your app is now ready to build installers for:
- **Windows**: `.exe` installer (Squirrel)
- **macOS**: `.dmg` and `.zip` files
- **Linux**: `.deb` (Debian/Ubuntu) and `.rpm` (Fedora/RHEL)

## 🚀 Local Build (Windows)

You've already successfully built for Windows! The installer is here:
```
D:\TypeCount\out\make\squirrel.windows\x64\TypeCount-1.0.0 Setup.exe
```

Users can run this installer to install TypeCount on their Windows machines.

To rebuild:
```powershell
npm run make
```

## 📦 Build Outputs

After running `npm run make`, you'll find:

### Windows
- `TypeCount-1.0.0 Setup.exe` - Main installer (~127 MB)
- `TypeCount-1.0.0-full.nupkg` - Update package for auto-updates

### macOS (when built on Mac)
- `TypeCount-1.0.0.dmg` - Disk image installer
- `TypeCount-1.0.0-darwin-x64.zip` - Compressed archive

### Linux (when built on Linux)
- `typecount_1.0.0_amd64.deb` - Debian/Ubuntu package
- `typecount-1.0.0-1.x86_64.rpm` - Fedora/RHEL package

## 🤖 Automated Builds with GitHub Actions

The CI/CD workflow is configured at `.github/workflows/build.yml`

### Triggers
- **Push to main**: Builds all platforms, uploads artifacts
- **Pull Request**: Builds and tests
- **Version Tag** (e.g., `v1.0.0`): Creates release with installers

### Creating a Release

1. **Update version** in `package.json`:
   ```json
   {
     "version": "1.0.1"
   }
   ```

2. **Commit and tag**:
   ```bash
   git add .
   git commit -m "Release v1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```

3. **GitHub Actions automatically**:
   - Builds for Windows, macOS, and Linux
   - Creates GitHub Release
   - Uploads all installers

4. **Download from**:
   - Go to your repo → Releases
   - Download installers for each platform

### Manual Download (Without Release)

After any push to main:
1. Go to **Actions** tab in GitHub
2. Click latest workflow run
3. Scroll to **Artifacts** section
4. Download:
   - `windows-installer` - Windows .exe
   - `macos-dmg` - macOS .dmg
   - `macos-zip` - macOS .zip
   - `linux-deb` - Linux .deb
   - `linux-rpm` - Linux .rpm

## 📋 Distribution Checklist

Before distributing:

- [ ] Test the installer on a clean machine
- [ ] Verify all features work after installation
- [ ] Check auto-start functionality
- [ ] Test on different OS versions
- [ ] Update README with download links
- [ ] Add screenshots to GitHub release
- [ ] Create installation instructions

## 🎯 Next Steps

### For Public Release

1. **Code Signing** (Optional but recommended)
   - Windows: Get a code signing certificate
   - macOS: Join Apple Developer Program ($99/year)
   - Prevents security warnings

2. **Auto-Updates**
   - Already configured with electron-updater
   - Publishes updates via GitHub Releases
   - Users get notified automatically

3. **Distribution Channels**
   - GitHub Releases (free)
   - Your own website
   - Microsoft Store (Windows)
   - Homebrew (macOS)
   - Snap/Flatpak (Linux)

### Testing Installer Locally

Run the installer you just built:
```powershell
.\out\make\squirrel.windows\x64\TypeCount-1.0.0 Setup.exe
```

The app will install to:
```
C:\Users\<YourName>\AppData\Local\TypeCount\
```

## 🐛 Troubleshooting

### Build fails with native module errors
```powershell
npm run rebuild
npm run make
```

### Need to clean build
```powershell
Remove-Item -Recurse -Force out
npm run make
```

### macOS/Linux builds
You need to build on the target platform or use GitHub Actions.

## 📚 Documentation

- Full build guide: `BUILD.md`
- Electron Forge: https://www.electronforge.io/
- GitHub Actions: https://github.com/features/actions

## 🎉 You're Ready!

Your app is now:
- ✅ Buildable as native installers
- ✅ Automatically built on GitHub
- ✅ Ready for distribution
- ✅ Auto-update enabled

Just push your code and let GitHub Actions handle the rest!

# Building TypeCount

This guide explains how to build TypeCount for distribution on Windows, macOS, and Linux.

## Prerequisites

- Node.js 20 or later
- npm
- Platform-specific requirements:
  - **Windows**: Visual Studio Build Tools or Windows SDK
  - **macOS**: Xcode Command Line Tools
  - **Linux**: Standard build tools (`build-essential` on Ubuntu/Debian)

## Installation

Install all dependencies:

```bash
npm install
```

## Building for Your Platform

### Local Build

Build for your current platform:

```bash
npm run make
```

This will create distributable packages in the `out/make/` directory:

- **Windows**: `.exe` installer in `out/make/squirrel.windows/`
- **macOS**: `.dmg` and `.zip` files in `out/make/`
- **Linux**: `.deb` and `.rpm` packages in `out/make/`

### Package Only (No Installer)

To package the app without creating installers:

```bash
npm run package
```

This creates an unpacked application in `out/TypeCount-<platform>-<arch>/`.

## Platform-Specific Notes

### Windows

The build process creates:
- `TypeCount-1.0.0 Setup.exe` - Main installer
- `.nupkg` files - Update packages for auto-update functionality

To sign the Windows installer (optional):
1. Obtain a code signing certificate
2. Set environment variables:
   ```powershell
   $env:WINDOWS_CERTS="path/to/cert.pfx"
   $env:WINDOWS_CERTS_PASSWORD="cert_password"
   ```
3. Run `npm run make`

### macOS

The build process creates:
- `.dmg` - Disk image for distribution
- `.zip` - Compressed archive

For code signing and notarization (required for distribution):
1. Join the Apple Developer Program
2. Create certificates in Xcode
3. Set environment variables:
   ```bash
   export APPLE_ID="your@email.com"
   export APPLE_ID_PASSWORD="app-specific-password"
   export CSC_LINK="path/to/certificate.p12"
   export CSC_KEY_PASSWORD="certificate_password"
   ```
4. Update `forge.config.ts` to enable signing:
   ```typescript
   osxSign: {
     identity: 'Developer ID Application: Your Name (TEAM_ID)',
   },
   osxNotarize: {
     appleId: process.env.APPLE_ID,
     appleIdPassword: process.env.APPLE_ID_PASSWORD,
   }
   ```

### Linux

The build process creates:
- `.deb` - Debian/Ubuntu package
- `.rpm` - Fedora/RHEL/CentOS package

Install on Ubuntu/Debian:
```bash
sudo dpkg -i out/make/deb/x64/typecount_1.0.0_amd64.deb
```

Install on Fedora/RHEL:
```bash
sudo rpm -i out/make/rpm/x64/typecount-1.0.0-1.x86_64.rpm
```

## CI/CD with GitHub Actions

The project includes a GitHub Actions workflow (`.github/workflows/build.yml`) that automatically:

1. **On every push to main**: Builds the app for all platforms and uploads artifacts
2. **On pull requests**: Builds and tests the app
3. **On version tags** (e.g., `v1.0.0`): Creates a GitHub release with installers

### Creating a Release

1. Update version in `package.json`:
   ```json
   {
     "version": "1.0.1"
   }
   ```

2. Commit and create a tag:
   ```bash
   git add package.json
   git commit -m "Release v1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```

3. GitHub Actions will automatically:
   - Build for Windows, macOS, and Linux
   - Create installers for each platform
   - Create a GitHub release
   - Upload all installers to the release

### Downloading Artifacts

After each build, artifacts are available for 30 days:

1. Go to the "Actions" tab in your GitHub repository
2. Click on the latest workflow run
3. Scroll down to "Artifacts"
4. Download the installers you need:
   - `windows-installer` - Windows .exe
   - `macos-dmg` - macOS .dmg
   - `macos-zip` - macOS .zip
   - `linux-deb` - Linux .deb
   - `linux-rpm` - Linux .rpm

## Icons

The app uses different icon formats for each platform:

- **Windows**: `assets/logo.ico` or `assets/icon.ico`
- **macOS**: `assets/logo.icns` or `assets/icon.icns`
- **Linux**: `assets/logo.png` or `assets/icon.png`

To update icons, replace the files in the `assets/` directory. Icon requirements:

- **ICO**: 256x256px (can contain multiple sizes)
- **ICNS**: 512x512px and 1024x1024px
- **PNG**: 512x512px

## Troubleshooting

### Native Module Build Errors

If you encounter errors with `uiohook-napi`:

```bash
npm run rebuild
```

### Permission Issues (macOS)

Users need to grant Accessibility permissions:
1. System Settings → Privacy & Security → Accessibility
2. Add TypeCount and enable it

### Missing Dependencies (Linux)

Install build tools:

```bash
# Ubuntu/Debian
sudo apt-get install build-essential libx11-dev libxtst-dev libpng-dev

# Fedora/RHEL
sudo dnf install gcc-c++ make libX11-devel libXtst-devel libpng-devel
```

## Auto-Update

The app includes electron-updater for automatic updates. To enable:

1. Configure your update server or use GitHub releases
2. Update `package.json` with repository URL
3. Publish new versions with version tags

Updates are checked automatically on app start.

## Distribution

### Direct Download

Users can download installers directly from:
- GitHub Releases page
- Your website (host the files from `out/make/`)

### Package Managers

Consider submitting to:
- **Windows**: Microsoft Store, Chocolatey, winget
- **macOS**: Homebrew Cask
- **Linux**: Ubuntu PPA, AUR (Arch), Flathub

## Support

For build issues, check:
- [Electron Forge Documentation](https://www.electronforge.io/)
- [Project Issues](https://github.com/typecount/typecount/issues)

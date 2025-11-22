# App Store Distribution Preparation Guide

## Overview
This guide covers the preparation and distribution of TypeCount across different platforms and distribution channels. Due to the nature of keystroke monitoring, special considerations apply to app store policies.

## Distribution Strategy

### Primary Distribution Channels
1. **Direct Distribution** (Recommended)
   - Official website downloads
   - GitHub Releases
   - Auto-updater system
   - Maximum control and user trust

2. **Alternative App Stores**
   - Microsoft Store (Windows)
   - Snap Store (Linux)
   - Homebrew (macOS)
   - Flathub (Linux)

3. **Traditional App Stores** (Limited)
   - macOS App Store (likely rejected due to accessibility requirements)
   - Windows Store (may require special permissions)

### Store Policy Challenges
TypeCount's keystroke monitoring functionality presents challenges for traditional app stores:

- **macOS App Store**: Likely to reject apps requiring accessibility permissions
- **Windows Store**: May require special enterprise/business category
- **Linux Repositories**: Generally more permissive but require packaging

---

## Code Signing Setup

### macOS Code Signing

#### Prerequisites
1. **Apple Developer Account**
   - Individual or Organization account ($99/year)
   - Developer ID Application certificate
   - Developer ID Installer certificate (for pkg installers)

2. **Certificates Setup**
   ```bash
   # Install certificates in Keychain
   # Download from Apple Developer portal
   # Install both Developer ID Application and Installer certificates
   ```

#### Code Signing Configuration

**Update `forge.config.js`:**
```javascript
module.exports = {
  packagerConfig: {
    appBundleId: 'com.typecount.app',
    appVersion: '1.0.0',
    buildVersion: '1.0.0',
    appCopyright: '© 2024 TypeCount',
    darwinDarkModeSupport: true,
    osxSign: {
      identity: 'Developer ID Application: Your Name (TEAM_ID)',
      'hardened-runtime': true,
      'gatekeeper-assess': false,
      'entitlements': 'build/entitlements.plist',
      'entitlements-inherit': 'build/entitlements.plist'
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID
    }
  }
};
```

**Create `build/entitlements.plist`:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.automation.apple-events</key>
  <true/>
  <key>com.apple.security.device.audio-input</key>
  <false/>
  <key>com.apple.security.device.camera</key>
  <false/>
  <key>com.apple.security.personal-information.addressbook</key>
  <false/>
  <key>com.apple.security.personal-information.calendars</key>
  <false/>
  <key>com.apple.security.personal-information.location</key>
  <false/>
  <key>com.apple.security.personal-information.photos-library</key>
  <false/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.network.server</key>
  <false/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
  <key>com.apple.security.files.downloads.read-write</key>
  <true/>
</dict>
</plist>
```

#### Notarization Process
```bash
# Build and sign the app
npm run make -- --platform=darwin

# Upload for notarization (handled automatically by electron-notarize)
# Check notarization status
xcrun altool --notarization-history 0 -u "your-apple-id@email.com" -p "app-specific-password"

# Staple the notarization
xcrun stapler staple "path/to/TypeCount.app"
```

### Windows Code Signing

#### Prerequisites
1. **Code Signing Certificate**
   - Extended Validation (EV) certificate recommended
   - From trusted CA (DigiCert, Sectigo, etc.)
   - Hardware token or cloud-based signing

2. **Certificate Setup**
   ```bash
   # Install certificate in Windows Certificate Store
   # Or use SignTool with certificate file
   ```

#### Windows Signing Configuration

**Update `forge.config.js` for Windows:**
```javascript
module.exports = {
  packagerConfig: {
    // ... other config
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
        signWithParams: `/a /fd sha256 /tr "http://timestamp.digicert.com" /td sha256`,
        name: 'TypeCount',
        authors: 'TypeCount Team',
        description: 'Personal typing analytics and productivity tracker'
      }
    }
  ]
};
```

#### Alternative Signing with SignTool
```bash
# Sign the executable manually
signtool sign /a /fd SHA256 /tr "http://timestamp.digicert.com" /td SHA256 "TypeCount.exe"

# Verify signature
signtool verify /pa "TypeCount.exe"
```

### Linux Packaging

#### AppImage Creation
```bash
# Install electron-builder for AppImage support
npm install --save-dev electron-builder

# Add to package.json
{
  "build": {
    "linux": {
      "target": [
        {
          "target": "AppImage",
          "arch": ["x64", "arm64"]
        },
        {
          "target": "deb",
          "arch": ["x64", "arm64"]
        },
        {
          "target": "rpm",
          "arch": ["x64", "arm64"]
        }
      ],
      "category": "Utility",
      "desktop": {
        "Name": "TypeCount",
        "Comment": "Personal typing analytics tracker",
        "Keywords": "typing;productivity;analytics;tracker;"
      }
    }
  }
}
```

---

## GitHub Actions CI/CD

### Automated Building and Signing

**Create `.github/workflows/build-and-release.yml`:**
```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]

    runs-on: ${{ matrix.os }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run make
        env:
          # macOS signing
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}

          # Windows signing
          WINDOWS_CERTIFICATE_FILE: ${{ secrets.WINDOWS_CERTIFICATE_FILE }}
          WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: TypeCount-${{ matrix.os }}
          path: out/make/**/*

  release:
    needs: build
    runs-on: ubuntu-latest

    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            TypeCount-*/**/*
          tag_name: ${{ github.ref_name }}
          name: TypeCount ${{ github.ref_name }}
          body: |
            ## TypeCount ${{ github.ref_name }}

            ### Download Instructions:
            - **macOS**: Download the .dmg file
            - **Windows**: Download the .exe installer
            - **Linux**: Download the .AppImage, .deb, or .rpm file

            ### Checksums:
            See attached checksums.txt for file verification.

            ### Changes:
            See [CHANGELOG.md](CHANGELOG.md) for detailed changes.
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Security Considerations

**Environment Variables Setup:**
```bash
# GitHub Secrets to configure:
APPLE_ID                    # Apple developer account email
APPLE_ID_PASSWORD          # App-specific password
APPLE_TEAM_ID              # Apple developer team ID
WINDOWS_CERTIFICATE_FILE   # Base64 encoded certificate
WINDOWS_CERTIFICATE_PASSWORD # Certificate password
GITHUB_TOKEN               # For releases (auto-generated)
```

---

## Store-Specific Preparation

### Microsoft Store (Windows)

#### Package Creation
1. **Install Windows SDK**
   ```bash
   # Install Windows 10 SDK
   # Use makeappx tool for package creation
   ```

2. **Create Package Manifest**
   Create `Package.appxmanifest`:
   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10">
     <Identity Name="TypeCount" Version="1.0.0.0" Publisher="CN=YourPublisher" />
     <Properties>
       <DisplayName>TypeCount</DisplayName>
       <PublisherDisplayName>TypeCount Team</PublisherDisplayName>
       <Description>Personal typing analytics and productivity tracker</Description>
       <Logo>Assets\StoreLogo.png</Logo>
     </Properties>
     <Dependencies>
       <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" />
     </Dependencies>
     <Capabilities>
       <Capability Name="internetClient" />
       <rescap:Capability Name="inputInjectionBrokered" />
     </Capabilities>
     <Applications>
       <Application Id="TypeCount" Executable="TypeCount.exe" EntryPoint="Windows.FullTrustApplication">
         <uap:VisualElements DisplayName="TypeCount" Description="Personal typing analytics tracker"
           BackgroundColor="transparent" Square150x150Logo="Assets\Square150x150Logo.png"
           Square44x44Logo="Assets\Square44x44Logo.png">
         </uap:VisualElements>
       </Application>
     </Applications>
   </Package>
   ```

3. **Store Assets Requirements**
   - 16x16 icon
   - 44x44 icon
   - 150x150 icon
   - 310x150 wide tile
   - 310x310 large tile
   - Store logo (50x50)
   - Splash screen (620x300)

### Snap Store (Linux)

#### Snapcraft Configuration
Create `snap/snapcraft.yaml`:
```yaml
name: typecount
version: '1.0.0'
summary: Personal typing analytics and productivity tracker
description: |
  TypeCount helps you understand your typing patterns, improve productivity,
  and achieve your daily goals through beautiful visualizations and
  engaging gamification features.

base: core20
confinement: strict
grade: stable

architectures:
  - build-on: amd64
  - build-on: arm64

apps:
  typecount:
    command: bin/typecount
    desktop: share/applications/typecount.desktop
    plugs:
      - desktop
      - desktop-legacy
      - x11
      - unity7
      - network
      - home

parts:
  typecount:
    plugin: dump
    source: ./out/TypeCount-linux-x64/
    stage-packages:
      - libnss3
      - libatk-bridge2.0-0
      - libgtk-3-0
      - libxss1
      - libasound2
```

### Homebrew (macOS)

#### Formula Creation
Create homebrew formula:
```ruby
class Typecount < Formula
  desc "Personal typing analytics and productivity tracker"
  homepage "https://typecount.app"
  url "https://github.com/itskritix/TypeCount/releases/download/v1.0.0/TypeCount-1.0.0.dmg"
  sha256 "checksum_here"
  version "1.0.0"

  depends_on macos: ">= :mojave"

  def install
    prefix.install Dir["*"]
    bin.write_exec_script "#{prefix}/TypeCount.app/Contents/MacOS/TypeCount"
  end

  def caveats
    <<~EOS
      TypeCount requires accessibility permissions to monitor keystrokes.
      Grant permission in System Preferences > Security & Privacy > Privacy > Accessibility
    EOS
  end

  test do
    system "#{bin}/typecount", "--version"
  end
end
```

---

## Distribution Assets

### Icons and Graphics

#### Required Icon Sizes
- **16x16**: System tray icon
- **24x24**: Small system icon
- **32x32**: Standard icon
- **48x48**: Medium icon
- **64x64**: Large icon
- **96x96**: Extra large icon
- **128x128**: High DPI icon
- **256x256**: macOS icon
- **512x512**: macOS high DPI icon
- **1024x1024**: App store icon

#### Asset Generation Script
```bash
#!/bin/bash
# generate-icons.sh

# Source SVG file
SOURCE="assets/icon.svg"

# Output directory
OUTPUT="build/icons"
mkdir -p "$OUTPUT"

# Generate all required sizes
sizes=(16 24 32 48 64 96 128 256 512 1024)

for size in "${sizes[@]}"; do
    inkscape --export-png="$OUTPUT/icon-${size}x${size}.png" \
             --export-width=$size \
             --export-height=$size \
             "$SOURCE"

    echo "Generated ${size}x${size} icon"
done

# Generate ICO file for Windows
convert "$OUTPUT/icon-16x16.png" \
        "$OUTPUT/icon-24x24.png" \
        "$OUTPUT/icon-32x32.png" \
        "$OUTPUT/icon-48x48.png" \
        "$OUTPUT/icon-256x256.png" \
        "$OUTPUT/icon.ico"

# Generate ICNS file for macOS
png2icns "$OUTPUT/icon.icns" \
         "$OUTPUT/icon-16x16.png" \
         "$OUTPUT/icon-32x32.png" \
         "$OUTPUT/icon-128x128.png" \
         "$OUTPUT/icon-256x256.png" \
         "$OUTPUT/icon-512x512.png" \
         "$OUTPUT/icon-1024x1024.png"

echo "Icon generation complete!"
```

### Marketing Materials

#### App Store Screenshots
1. **Main Dashboard** (1280x800)
2. **Analytics View** (1280x800)
3. **Achievement Gallery** (1280x800)
4. **Settings Interface** (1280x800)
5. **Privacy Features** (1280x800)

#### Privacy Labels (iOS/macOS App Store)
```json
{
  "privacyLabels": {
    "dataCollected": {
      "usage": {
        "linked": false,
        "tracking": false,
        "purposes": ["Analytics"]
      }
    },
    "dataNotCollected": [
      "Contact Info",
      "User Content",
      "Identifiers",
      "Location",
      "Contacts",
      "Health & Fitness",
      "Financial Info",
      "Browsing History",
      "Search History",
      "Sensitive Info"
    ]
  }
}
```

#### App Descriptions

**Short Description (80 chars):**
"Personal typing analytics tracker with privacy-first design & gamification"

**Full Description:**
```
TypeCount - Personal Typing Analytics & Productivity Tracker

Transform your typing habits into insights with TypeCount, the privacy-first productivity tracker that helps you understand your typing patterns without compromising your privacy.

🔒 PRIVACY FIRST
• Never stores actual keystrokes - only counts
• All data stays on your device by default
• Optional cloud sync with encryption
• Complete transparency about data collection
• Export your data anytime

📊 BEAUTIFUL ANALYTICS
• Real-time keystroke counting
• Daily, weekly, and monthly insights
• Peak productivity hour identification
• Typing pattern analysis
• Historical trend visualization

🎯 GAMIFICATION
• 25+ achievements to unlock
• Daily and weekly challenges
• Goal setting and progress tracking
• Experience points and leveling
• Personality type insights

☁️ MULTI-DEVICE SYNC (OPTIONAL)
• Sync across Windows, Mac, and Linux
• Intelligent conflict resolution
• Secure encrypted cloud storage
• Works completely offline

✨ FEATURES
• Lightweight and efficient
• System tray integration
• Dark/light theme support
• Auto-launch on system startup
• Comprehensive export options

Perfect for writers, developers, students, and anyone curious about their typing habits. Join thousands of users who've discovered their typing potential with TypeCount!

SYSTEM REQUIREMENTS
• macOS 10.14+, Windows 10+, or Linux
• 50MB storage space
• Internet for optional cloud sync
```

---

## Legal and Compliance

### Privacy Policy
Location: `docs/privacy-policy.md`
- Required for app store submission
- Must be accessible from app
- Should cover all data collection practices

### Terms of Service
Location: `docs/terms-of-service.md`
- Legal protection for service provider
- User agreement and limitations
- Liability disclaimers

### License Information
- Open source license (if applicable)
- Third-party license acknowledgments
- Included in About dialog

### GDPR Compliance
- Data processing lawfulness
- User consent mechanisms
- Right to erasure implementation
- Data portability features

---

## Testing and Quality Assurance

### Pre-Release Checklist

#### Functionality Testing
- [ ] Keystroke counting accuracy
- [ ] Achievement system functionality
- [ ] Cloud sync operation
- [ ] Data export/import
- [ ] Permission handling
- [ ] Auto-updater functionality

#### Platform-Specific Testing
- [ ] macOS accessibility permissions
- [ ] Windows administrator privileges
- [ ] Linux distribution compatibility
- [ ] Code signing verification
- [ ] Installation/uninstallation

#### Performance Testing
- [ ] Memory usage under 200MB
- [ ] CPU usage under 5%
- [ ] Startup time under 3 seconds
- [ ] No memory leaks over 24 hours

#### Security Testing
- [ ] No keystroke content storage
- [ ] Secure file permissions
- [ ] Encrypted cloud communication
- [ ] No unauthorized network requests

### Beta Testing Program
1. **Recruit beta testers**
   - GitHub community
   - Social media outreach
   - Personal network

2. **Beta distribution**
   - GitHub pre-releases
   - Direct download links
   - Feedback collection system

3. **Feedback integration**
   - Bug tracking and fixes
   - Feature request evaluation
   - Performance optimization

---

## Release Process

### Version Management
```bash
# Update version in package.json
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.1 -> 1.1.0
npm version major  # 1.1.0 -> 2.0.0

# Create git tag
git tag -a v1.0.0 -m "Version 1.0.0 release"
git push origin v1.0.0
```

### Release Checklist
1. [ ] Update version numbers
2. [ ] Update changelog
3. [ ] Run full test suite
4. [ ] Build for all platforms
5. [ ] Sign all executables
6. [ ] Upload to distribution channels
7. [ ] Update website
8. [ ] Announce release
9. [ ] Monitor for issues

### Post-Release Monitoring
- Analytics review
- Crash report analysis
- User feedback collection
- Performance metrics monitoring
- Update success rates

---

*This document should be updated as distribution channels and requirements change.*
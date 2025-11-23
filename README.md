# TypeCount

Professional keystroke analytics and productivity tracking application. Monitor your typing patterns, unlock achievements, and optimize your productivity with real-time analytics and gamification.

![TypeCount](assets/logo.png)

## ✨ Features

- 🎯 **Real-time Keystroke Tracking** - Monitor your typing activity with precision
- 📊 **Beautiful Dashboard** - Visualize your productivity with interactive charts
- 🏆 **Achievement System** - Unlock achievements as you type
- 🔥 **Daily Streaks** - Build consistency with streak tracking
- 🚀 **Auto-start** - Launches on system startup
- 🔒 **Privacy-first** - All data stored locally
- ☁️ **Cloud Sync** - Optional Supabase integration for backup
- 🌙 **Low Resource Usage** - Runs efficiently in the background

## 📥 Download & Installation

### Windows
1. Download `TypeCount Setup.exe` from [Releases](https://github.com/itskritix/TypeCount/releases)
2. Run the installer
3. TypeCount will start automatically

### macOS
1. Download `TypeCount.dmg` from [Releases](https://github.com/itskritix/TypeCount/releases)
2. Open the DMG and drag TypeCount to Applications
3. On first launch, grant Accessibility permissions:
   - System Settings → Privacy & Security → Accessibility
   - Add TypeCount and enable it

### Linux

**Debian/Ubuntu:**
```bash
sudo dpkg -i typecount_1.0.0_amd64.deb
```

**Fedora/RHEL/CentOS:**
```bash
sudo rpm -i typecount-1.0.0-1.x86_64.rpm
```

## 🛠️ Development

### Prerequisites
- Node.js 20 or later
- npm
- Platform-specific build tools:
  - **Windows**: Visual Studio Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `build-essential`

### Setup

```bash
# Clone the repository
git clone https://github.com/itskritix/TypeCount.git
cd TypeCount

# Install dependencies
npm install

# Start development server
npm start
```

### Building

```bash
# Build for your platform
npm run make

# Output will be in: out/make/
```

For detailed build instructions, see [BUILD.md](BUILD.md)

## 🚀 CI/CD

GitHub Actions automatically builds installers for all platforms when you:
- Push to main branch
- Create a version tag (e.g., `v1.0.0`)

### Creating a Release

```bash
# Using the release script
.\release.ps1 1.0.1

# Or manually
git tag v1.0.1
git push origin main --tags
```

See [RELEASE.md](RELEASE.md) for more details.

## 📖 Documentation

- [Build Guide](BUILD.md) - Complete build and packaging instructions
- [Release Guide](RELEASE.md) - How to create and distribute releases
- [Supabase Schema](supabase_schema.sql) - Database schema for cloud sync

## 🔧 Tech Stack

- **Framework**: Electron
- **Language**: TypeScript
- **Build Tool**: Vite
- **Packaging**: Electron Forge
- **Charts**: Chart.js
- **Native Hooks**: uiohook-napi
- **Storage**: electron-store
- **Cloud**: Supabase (optional)

## 🎯 Roadmap

- [ ] Multi-language support
- [ ] Dark mode
- [ ] Custom keyboard shortcuts
- [ ] Export analytics data
- [ ] Team/workspace features
- [ ] Browser extension integration

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details

## 👤 Author

**itskritix**
- GitHub: [@itskritix](https://github.com/itskritix)
- Email: itskritix@gmail.com

## 🙏 Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Keyboard hooks powered by [uiohook-napi](https://github.com/SnosMe/uiohook-napi)
- Charts by [Chart.js](https://www.chartjs.org/)

## ⚠️ Privacy & Permissions

TypeCount requires accessibility permissions to track keystrokes. All data is:
- ✅ Stored locally on your device
- ✅ Never shared without your consent
- ✅ Optionally synced to your private Supabase instance
- ✅ Fully under your control

---

⭐ Star this repo if you find it useful!

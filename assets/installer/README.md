# TypeCount Installer Assets

## Recommended: electron-builder (NSIS) - No GIF Needed!

The recommended approach for Windows installers is **electron-builder with NSIS**. This uses **static BMP images** instead of animated GIFs, making it much simpler to set up.

### Quick Start

```bash
# Generate BMP installer assets from logo
npm run generate:installer-assets

# Build Windows installer
npm run dist:win
```

### How It Works

1. **One-click installer** (default): Shows a simple progress window with your icon
2. **Assisted installer**: Shows wizard pages with sidebar/header images

The one-click mode only needs your `icon.ico` file - no BMP generation required!

## Asset Specifications

| Asset | Size | Format | Used By |
|-------|------|--------|---------|
| `icon.ico` | 256x256 | ICO | Both modes (required) |
| `installerSidebar.bmp` | 164×314 | BMP | Assisted mode only |
| `installerHeader.bmp` | 150×57 | BMP | Assisted mode only |

## Switching Between Modes

In `electron-builder.yml`:

```yaml
nsis:
  # One-click (modern, simple) - DEFAULT
  oneClick: true

  # OR Assisted (wizard-style)
  # oneClick: false
```

## Branding Colors (from TypeCount logo)

- Background Dark: `#2b2b2b`
- Background Medium: `#4a4a4a`
- Metallic Light: `#909090`
- Metallic Highlight: `#e0e0e0`
- Surface: `#1a1a1e`

## Legacy: Squirrel Installer (GIF)

If you need to use the Squirrel installer with animated GIF:

1. Open `installing-animation.html` in a browser
2. Screen record at 420×300 pixels for 4-6 seconds
3. Save as `installing.gif`
4. Use `npm run make` instead of `npm run dist:win`

**Note**: We recommend using electron-builder (NSIS) as it's used by VS Code, Discord, Slack, and other major Electron apps.

## Reference

- [electron-builder NSIS docs](https://www.electron.build/nsis.html)
- [NSIS Options](https://www.electron.build/interfaces/app_builder_lib.nsisoptions)

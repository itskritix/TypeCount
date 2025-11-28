// Splash screen for TypeCount - shown during app startup

import { BrowserWindow, screen } from 'electron';

let splashWindow: BrowserWindow | null = null;

export function createSplashScreen(): BrowserWindow {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  const splashWidth = 480;
  const splashHeight = 320;

  splashWindow = new BrowserWindow({
    width: splashWidth,
    height: splashHeight,
    x: Math.floor((screenWidth - splashWidth) / 2),
    y: Math.floor((screenHeight - splashHeight) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(getSplashHTML())}`);

  splashWindow.once('ready-to-show', () => {
    splashWindow?.show();
  });

  return splashWindow;
}

export function closeSplashScreen(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    // Fade out animation
    splashWindow.webContents.executeJavaScript(`
      document.body.style.transition = 'opacity 0.3s ease';
      document.body.style.opacity = '0';
    `);

    setTimeout(() => {
      splashWindow?.close();
      splashWindow = null;
    }, 300);
  }
}

export function updateSplashStatus(status: string): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(`
      const statusEl = document.getElementById('status');
      if (statusEl) statusEl.textContent = '${status}';
    `);
  }
}

function getSplashHTML(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>TypeCount</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=DM+Sans:wght@400;500;600;700&display=swap');

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        @keyframes gradientShift {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }

        @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-10px) rotate(2deg); }
        }

        @keyframes pulse {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.05); }
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        @keyframes dotPulse {
            0%, 80%, 100% { transform: scale(0); opacity: 0; }
            40% { transform: scale(1); opacity: 1; }
        }

        @keyframes goldGlow {
            0%, 100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.3); }
            50% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.5); }
        }

        body {
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: transparent;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            -webkit-app-region: drag;
        }

        .splash-container {
            width: 440px;
            height: 280px;
            background: linear-gradient(135deg, #050505 0%, #0a0a0a 50%, #050505 100%);
            background-size: 200% 200%;
            animation: gradientShift 8s ease infinite;
            border-radius: 24px;
            position: relative;
            overflow: hidden;
            border: 1px solid rgba(255, 215, 0, 0.15);
            box-shadow:
                0 0 0 1px rgba(255, 215, 0, 0.05),
                0 25px 50px -12px rgba(0, 0, 0, 0.8),
                0 0 80px rgba(255, 215, 0, 0.08),
                0 0 120px rgba(0, 245, 255, 0.05);
        }

        /* Animated background orbs - Gold theme */
        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(60px);
            animation: pulse 4s ease-in-out infinite;
        }

        .orb-1 {
            width: 200px;
            height: 200px;
            background: rgba(255, 215, 0, 0.15);
            top: -50px;
            left: -50px;
            animation-delay: 0s;
        }

        .orb-2 {
            width: 180px;
            height: 180px;
            background: rgba(0, 245, 255, 0.1);
            bottom: -40px;
            right: -40px;
            animation-delay: -2s;
        }

        .orb-3 {
            width: 100px;
            height: 100px;
            background: rgba(255, 215, 0, 0.2);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            animation-delay: -1s;
        }

        /* Grid pattern */
        .grid-pattern {
            position: absolute;
            inset: 0;
            background-image:
                linear-gradient(rgba(255, 215, 0, 0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 215, 0, 0.02) 1px, transparent 1px);
            background-size: 30px 30px;
            mask-image: radial-gradient(ellipse at center, black 20%, transparent 70%);
        }

        /* Content */
        .content {
            position: relative;
            z-index: 10;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
        }

        /* Logo */
        .logo-container {
            animation: fadeInUp 0.6s ease forwards, float 6s ease-in-out infinite;
            animation-delay: 0s, 0.6s;
            margin-bottom: 24px;
        }

        .logo {
            width: 80px;
            height: 80px;
            filter: drop-shadow(0 10px 30px rgba(255, 215, 0, 0.3));
        }

        .logo svg {
            width: 100%;
            height: 100%;
        }

        /* Text */
        .app-name {
            font-family: 'Archivo Black', sans-serif;
            font-size: 32px;
            font-weight: 800;
            letter-spacing: 2px;
            background: linear-gradient(135deg, #FFD700 0%, #FFE55C 50%, #FFD700 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: fadeInUp 0.6s ease forwards;
            animation-delay: 0.1s;
            opacity: 0;
            margin-bottom: 8px;
            text-transform: uppercase;
        }

        .tagline {
            font-size: 14px;
            color: #71717a;
            animation: fadeInUp 0.6s ease forwards;
            animation-delay: 0.2s;
            opacity: 0;
            margin-bottom: 32px;
        }

        /* Loading indicator */
        .loader-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            animation: fadeInUp 0.6s ease forwards;
            animation-delay: 0.3s;
            opacity: 0;
        }

        .loader {
            display: flex;
            gap: 6px;
        }

        .loader-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: linear-gradient(135deg, #CC9900, #FFD700, #FFE55C);
            animation: dotPulse 1.4s ease-in-out infinite;
            box-shadow: 0 0 10px rgba(255, 215, 0, 0.4);
        }

        .loader-dot:nth-child(1) { animation-delay: 0s; }
        .loader-dot:nth-child(2) { animation-delay: 0.2s; }
        .loader-dot:nth-child(3) { animation-delay: 0.4s; }

        .status {
            font-size: 12px;
            color: #71717a;
            letter-spacing: 0.5px;
        }

        /* Shimmer effect */
        .shimmer {
            position: absolute;
            top: 0;
            left: 0;
            width: 50%;
            height: 100%;
            background: linear-gradient(
                90deg,
                transparent,
                rgba(255, 215, 0, 0.03),
                transparent
            );
            animation: shimmer 3s infinite;
        }

        /* Version badge */
        .version {
            position: absolute;
            bottom: 16px;
            right: 20px;
            font-size: 10px;
            color: #52525b;
            letter-spacing: 0.5px;
        }
    </style>
</head>
<body>
    <div class="splash-container">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
        <div class="grid-pattern"></div>
        <div class="shimmer"></div>

        <div class="content">
            <div class="logo-container">
                <div class="logo">
                    <svg viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="bg_grad" x1="512" y1="0" x2="512" y2="1024" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stop-color="#1a1a1a"/>
                                <stop offset="1" stop-color="#0a0a0a"/>
                            </linearGradient>
                            <linearGradient id="gold_grad" x1="112" y1="112" x2="912" y2="912" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stop-color="#FFD700"/>
                                <stop offset="0.5" stop-color="#FFE55C"/>
                                <stop offset="1" stop-color="#CC9900"/>
                            </linearGradient>
                            <linearGradient id="glass_surface" x1="112" y1="112" x2="912" y2="912" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stop-color="#FFD700" stop-opacity="0.15"/>
                                <stop offset="0.5" stop-color="#FFD700" stop-opacity="0.05"/>
                                <stop offset="1" stop-color="#FFD700" stop-opacity="0.02"/>
                            </linearGradient>
                            <linearGradient id="glass_border" x1="112" y1="112" x2="912" y2="912" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stop-color="#FFD700" stop-opacity="0.6"/>
                                <stop offset="1" stop-color="#FFD700" stop-opacity="0.1"/>
                            </linearGradient>
                            <linearGradient id="liquid_grad" x1="300" y1="300" x2="700" y2="700" gradientUnits="userSpaceOnUse">
                                <stop offset="0" stop-color="#FFE55C"/>
                                <stop offset="0.5" stop-color="#FFD700"/>
                                <stop offset="1" stop-color="#CC9900"/>
                            </linearGradient>
                            <radialGradient id="liquid_highlight" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(450 400) rotate(45) scale(150)">
                                <stop offset="0" stop-color="white" stop-opacity="0.95"/>
                                <stop offset="1" stop-color="white" stop-opacity="0"/>
                            </radialGradient>
                            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                                <feDropShadow dx="0" dy="20" stdDeviation="30" flood-color="#FFD700" flood-opacity="0.2"/>
                            </filter>
                            <filter id="blob_glow">
                                <feGaussianBlur stdDeviation="8" in="SourceAlpha" result="blur"/>
                                <feSpecularLighting in="blur" surfaceScale="5" specularConstant="1.2" specularExponent="30" lighting-color="#FFD700" result="specular">
                                    <fePointLight x="300" y="300" z="300"/>
                                </feSpecularLighting>
                                <feComposite in="specular" in2="SourceAlpha" operator="in" result="composite"/>
                                <feMerge>
                                    <feMergeNode in="SourceGraphic"/>
                                    <feMergeNode in="composite"/>
                                </feMerge>
                            </filter>
                        </defs>
                        <rect x="112" y="112" width="800" height="800" rx="180" fill="url(#bg_grad)" filter="url(#shadow)"/>
                        <rect x="112" y="112" width="800" height="800" rx="180" fill="url(#glass_surface)"/>
                        <rect x="112" y="112" width="800" height="800" rx="180" stroke="url(#glass_border)" stroke-width="4"/>
                        <g filter="url(#blob_glow)">
                            <path d="M512 280 C 680 240, 760 400, 740 512 C 720 650, 600 760, 512 740 C 400 720, 280 640, 300 512 C 320 380, 420 300, 512 280 Z" fill="url(#liquid_grad)"/>
                            <ellipse cx="420" cy="420" rx="80" ry="50" transform="rotate(-30 420 420)" fill="url(#liquid_highlight)"/>
                        </g>
                        <path d="M112 112 L 912 912 L 912 112 Z" fill="#FFD700" fill-opacity="0.02" style="mix-blend-mode: overlay;"/>
                    </svg>
                </div>
            </div>
            <div class="app-name">TypeCount</div>
            <div class="tagline">Keystroke Analytics & Productivity</div>

            <div class="loader-container">
                <div class="loader">
                    <div class="loader-dot"></div>
                    <div class="loader-dot"></div>
                    <div class="loader-dot"></div>
                </div>
                <div class="status" id="status">Starting up...</div>
            </div>
        </div>

        <div class="version">v1.0.0</div>
    </div>
</body>
</html>`;
}

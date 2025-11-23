# TypeCount Project Overview

TypeCount is a professional keystroke analytics and productivity tracking desktop application. It monitors typing patterns, unlocks achievements, and helps users optimize their productivity through real-time analytics and gamification.

## Technology Stack

*   **Framework:** Electron
*   **Language:** TypeScript
*   **Bundler:** Vite
*   **Keystroke Tracking:** `uiohook-napi` (Native Node.js module)
*   **Persistence:** `electron-store` (Local JSON file)
*   **Cloud Sync:** Supabase (Integrated via `cloudSync.ts`)
*   **Build Tool:** Electron Forge

## Architecture

The application follows the standard Electron multi-process architecture:

*   **Main Process (`src/main.ts`):**
    *   Manages application lifecycle.
    *   Initializes the System Tray and Desktop Widget.
    *   Loads and manages the `uiohook-napi` native module for global keystroke tracking.
    *   Handles data persistence using `electron-store`.
    *   Calculates gamification logic (levels, achievements) to ensure data integrity.
    *   Communicates with the renderer via IPC.

*   **Renderer Process (`src/renderer.ts`):**
    *   Renders the main dashboard UI (Productivity Insights, Achievements, Settings).
    *   Handles user interactions and visualizations.
    *   Communicates with the main process via `window.electronAPI`.
    *   Manages Cloud Sync operations.

*   **Preload Script (`src/preload.ts`):**
    *   Acts as a secure bridge between the Main and Renderer processes.
    *   Exposes a safe API (`electronAPI`) via `contextBridge`.

## Key Features

1.  **Keystroke Tracking:** Global monitoring of keyboard activity using native hooks.
2.  **Gamification:**
    *   **XP & Levels:** Users gain XP based on typing volume and challenges.
    *   **Achievements:** Unlocked by reaching milestones (e.g., "First Steps", "Legendary Typist").
    *   **Challenges:** Daily and weekly goals to encourage consistency.
3.  **Analytics:**
    *   Daily/Weekly/Monthly statistics.
    *   Heatmaps and productivity trends (Peak hours).
4.  **Desktop Widget:** A floating, transparent widget showing real-time stats.
5.  **Cloud Sync:** Backup and restore functionality using Supabase.

## Development Setup

### Prerequisites

*   Node.js (v16+ recommended)
*   npm

### Installation

```bash
npm install
```

### Running in Development

Start the application in development mode with hot reloading:

```bash
npm start
```

### Building for Production

Package the application for the current OS:

```bash
npm run package
```

Create installers (Make):

```bash
npm run make
```

### Linting

Run ESLint to check for code quality issues:

```bash
npm run lint
```

## Key Files & Directories

*   **`src/main.ts`:** Entry point. Handles low-level tracking and app logic.
*   **`src/renderer.ts`:** UI logic and rendering.
*   **`src/preload.ts`:** IPC bridge definition.
*   **`src/gamification.ts`:** Logic for achievements, levels, and challenges.
*   **`src/cloudSync.ts`:** Supabase integration for data syncing.
*   **`forge.config.ts`:** Configuration for Electron Forge (building, packaging, makers).
*   **`package.json`:** Dependencies and scripts.

## Coding Conventions

*   **TypeScript:** Strict typing is encouraged. Interfaces are defined for data structures like `Achievement`, `Goal`, and `Challenge`.
*   **IPC:** All inter-process communication must go through `preload.ts` and be typed in `window.electronAPI`.
*   **Native Modules:** `uiohook-napi` requires special handling (see `loadNativeModuleSecurely` in `main.ts` and `extraResource` in `forge.config.ts`).
*   **Styles:** CSS is imported directly into `renderer.ts`.

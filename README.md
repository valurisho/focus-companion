# Focus Companion 🐾

A macOS desktop application that combines a Pomodoro timer with an interactive floating study companion to help students stay focused.

## Tech Stack

| Technology | Purpose |
|---|---|
| **Electron** | Desktop framework, macOS menu bar integration, and window management |
| **React 19** | User interface development |
| **TypeScript** | Application logic and type safety |
| **Vite** | Development server and build tooling |
| **Tailwind CSS** | UI styling |
| **CSS Animations / Rive** | Animated study companion |
| **Electron IPC** | Communication between windows |
| **electron-store / SQLite** | Local data persistence |
| **MediaPipe (Planned)** | Computer vision for Max Focus mode |

## Application Architecture

Electron manages three interfaces within a single macOS application:

1. **Main Window:** Full application with Pomodoro timer, settings, and companion customization.
2. **Menu Bar Popup:** Native macOS menu bar icon that opens a compact interface with timer controls and shortcuts.
3. **Floating Companion:** Transparent, frameless, always-on-top window displaying an animated character.

All three interfaces use React and TypeScript and communicate through Electron IPC to keep application state synchronized.

## Platform

- **Target OS:** macOS
- **Desktop Framework:** Electron
- **Frontend:** React + TypeScript + Vite
- **Architecture:** Electron main process + multiple React renderer windows

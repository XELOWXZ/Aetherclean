# ⚡ AetherClean Pro - PC Optimization & Windows Tuner

A modern, high-performance desktop utility built with **Electron**, **TailwindCSS**, and **Native Windows API/PowerShell** designed for real-time hardware monitoring, intelligent memory balancing, system junk cleaning, and performance profiles.

![UI Dark Theme Glassmorphism](tray-icon.png)

---

## ✨ Key Features

- **Real Hardware Detection**: Inspects live CPU cores, GPU specs, clock speeds, and RAM slots via `systeminformation` (no fake mock data).
- **🎨 Graphic Workstation Mode**:
  - Auto-balances background memory every 30 seconds for creative apps (e.g., Adobe Photoshop, Illustrator, Premiere).
  - **Crash Guard**: Warns before high-load application launch if RAM/CPU resources are near critical thresholds to prevent system freezes and BSODs.
- **🎮 Game Booster Mode**:
  - Activates Windows Ultimate High-Performance power plans.
  - Flushes standby list and optimizes background process working sets.
- **🧹 System Junk Cleaner**:
  - Safe scanning and cleanup for `%TEMP%`, `Windows Temp`, `Prefetch`, and browser cache.
- **🚀 Startup Apps Manager**:
  - Inspects and toggles Windows startup entries directly through registry keys.
- **🛠️ Direct Windows Tweaks**:
  - One-click Flush DNS, TRIM SSD optimization, Power Plan switcher, Explorer restart, and icon cache rebuild.
- **🖥️ System Tray & Background Service**:
  - Runs silently in the background with zero PowerShell/command prompt windows.
  - Double-click or right-click the system tray icon for instant mode toggling and memory flushing.

---

## 📋 Prerequisites

- **OS**: Windows 10 / 11 (64-bit)
- **Node.js**: v18.0.0 or higher
- **PowerShell**: 5.1+

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/comclean.git
cd comclean
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run Development Mode
```bash
npm start
```

### 4. Run in Background (No Terminal Window)
Double-click `start.bat` or run `AetherClean-Start.vbs`.

---

## 📁 Project Structure

```
├── main.js                  # Electron main process (IPC handlers, PowerShell execution, Tray)
├── preload.js               # Context bridge exposing safe native APIs
├── index.html               # Frontend UI (Glassmorphic dark design, Canvas charts)
├── package.json             # App metadata & dependencies
├── AetherClean-Start.vbs    # Headless background launcher
├── create-shortcut.ps1      # Desktop shortcut generator
├── make-icon.ps1            # Tray icon generator
└── start.bat                # Quick launch script
```

---

## 🛡️ License

MIT License - feel free to modify and share!

const { contextBridge, ipcRenderer } = require('electron');

// เชื่อมต่อ Bridge API ระหว่าง Node.js (Main Process) และ Webpage (Renderer Process)
contextBridge.exposeInMainWorld('electronAPI', {
  getSysSpecs: () => ipcRenderer.invoke('get-sys-specs'),
  getRealtimeStats: () => ipcRenderer.invoke('get-realtime-stats'),
  optimizeMemory: () => ipcRenderer.invoke('optimize-memory'),
  killProcess: (pid) => ipcRenderer.invoke('kill-process', pid),
  scanJunk: () => ipcRenderer.invoke('scan-junk'),
  cleanJunk: (categoryIds) => ipcRenderer.invoke('clean-junk', categoryIds),
  getStartupApps: () => ipcRenderer.invoke('get-startup-apps'),
  toggleStartupApp: (name, enable) => ipcRenderer.invoke('toggle-startup-app', name, enable),
  applyTweak: (tweakId) => ipcRenderer.invoke('apply-tweak', tweakId),
  setSystemMode: (mode) => ipcRenderer.invoke('set-system-mode', mode),
  emergencyRamFlush: () => ipcRenderer.invoke('emergency-ram-flush'),
  onModeFromTray: (callback) => ipcRenderer.on('set-mode-from-tray', (_, mode) => callback(mode))
});
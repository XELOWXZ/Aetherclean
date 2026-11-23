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
  onModeFromTray: (callback) => ipcRenderer.on('set-mode-from-tray', (_, mode) => callback(mode)),
  
  // Auto Clean APIs
  getAutoCleanConfig: () => ipcRenderer.invoke('get-auto-clean-config'),
  saveAutoCleanConfig: (config) => ipcRenderer.invoke('save-auto-clean-config', config),
  triggerAutoClean: () => ipcRenderer.invoke('trigger-auto-clean'),
  onAutoCleanEvent: (callback) => ipcRenderer.on('auto-clean-event', (_, data) => callback(data)),
  onAutoCleanSettingsUpdated: (callback) => ipcRenderer.on('auto-clean-settings-updated', (_, data) => callback(data)),

  // Gaming Display & NVIDIA Settings
  getDisplayVibrance: () => ipcRenderer.invoke('get-display-vibrance'),
  setDisplayVibrance: (level, brightness, contrast, gamma) => ipcRenderer.invoke('set-display-vibrance', level, brightness, contrast, gamma),
  resetDisplayVibrance: () => ipcRenderer.invoke('reset-display-vibrance'),
  openNvidiaControlPanel: () => ipcRenderer.invoke('open-nvidia-control-panel'),

  // Auto-Update APIs
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: (downloadUrl) => ipcRenderer.invoke('install-update', downloadUrl),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (_, data) => callback(data))
});

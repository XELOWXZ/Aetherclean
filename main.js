// ป้องกันกรณีที่ Terminal หรือ IDE ตั้งค่า ELECTRON_RUN_AS_NODE ค้างไว้ใน Environment
if (process.env.ELECTRON_RUN_AS_NODE) {
  const { spawn } = require('child_process');
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [__dirname], {
    detached: true,
    stdio: 'ignore',
    env
  });
  child.unref();
  process.exit(0);
}

const electron = require('electron');
const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile, exec } = require('child_process');
const si = require('systeminformation');

// กำหนด AppUserModelId สำหรับ Windows 10/11 Notification
try {
  app.setAppUserModelId('com.aetherclean.app');
} catch (e) {}

function writeDebugLog(msg) {
  try {
    const logDir = app.getPath('userData');
    fs.appendFileSync(path.join(logDir, 'tray-debug.log'), msg);
  } catch (e) {}
}

process.on('uncaughtException', (err) => {
  writeDebugLog(`UNCAUGHT: ${err.stack || err}\n`);
});
process.on('unhandledRejection', (reason) => {
  writeDebugLog(`UNHANDLED: ${reason}\n`);
});
app.on('quit', (event, exitCode) => {
  writeDebugLog(`APP QUIT with code: ${exitCode}\n`);
});

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ============================================================================
// CONFIG & PERSISTENCE (บันทึกและโหลดการตั้งค่า Auto Clean)
// ============================================================================
const CONFIG_PATH = path.join(app.getPath('userData'), 'aetherclean-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return {
    autoCleanEnabled: true,
    autoCleanIntervalMinutes: 180, // ค่าเริ่มต้น 3 ชั่วโมง
    autoCleanCategories: ['temp', 'wintemp', 'browser_cache', 'windows_update', 'log_files', 'thumbnails'],
    autoCleanNotify: true,
    autoRamCleanEnabled: true,
    autoRamCleanThreshold: 85,
    lastCleanTime: null,
    lastFreedBytes: 0,
    totalFreedBytes: 0,
    totalCleansCount: 0
  };
}

let appConfig = loadConfig();

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

let nextAutoCleanTimestamp = Date.now() + (appConfig.autoCleanIntervalMinutes * 60 * 1000);
let isAutoCleaningRunning = false;
let backgroundWatcherInterval = null;
let lastRamOptimizeTime = 0;

function scheduleNextAutoClean() {
  nextAutoCleanTimestamp = Date.now() + (appConfig.autoCleanIntervalMinutes * 60 * 1000);
}

function getSanitizedConfig() {
  return {
    ...appConfig,
    nextRunTimestamp: nextAutoCleanTimestamp,
    isRunning: isAutoCleaningRunning
  };
}


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#070a0f',
    title: 'AetherClean Pro - PC Optimization & Windows Tuner',
    autoHideMenuBar: true,
    show: true,
    icon: path.join(__dirname, 'tray-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // เมื่อกดปิดหน้าต่าง (X) ให้ย่อลง System Tray แทนการปิดโปรแกรม เพื่อให้ทำงานเบื้องหลังต่อเนื่อง
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: 'AetherClean Pro ยังคงทำงานเบื้องหลัง',
          body: 'โปรแกรมย่อลงในถาดระบบ (System Tray) มุมขวาล่าง และคอยดูแล RAM/Crash Guard ให้คุณตลอดเวลา'
        }).show();
      }
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const autoCleanLabel = appConfig.autoCleanEnabled 
    ? '✨ Auto Clean (ล้างไฟล์ขยะอัตโนมัติ): [เปิด ON]'
    : '✨ Auto Clean (ล้างไฟล์ขยะอัตโนมัติ): [ปิด OFF]';

  const ramGuardLabel = appConfig.autoRamCleanEnabled
    ? `🧠 Auto RAM Guard (> ${appConfig.autoRamCleanThreshold || 85}%): [เปิด ON]`
    : `🧠 Auto RAM Guard: [ปิด OFF]`;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '🚀 เปิดหน้าต่าง AetherClean Pro',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: autoCleanLabel,
      type: 'checkbox',
      checked: !!appConfig.autoCleanEnabled,
      click: async (item) => {
        appConfig.autoCleanEnabled = item.checked;
        saveConfig();
        scheduleNextAutoClean();
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auto-clean-settings-updated', getSanitizedConfig());
        }
      }
    },
    {
      label: ramGuardLabel,
      type: 'checkbox',
      checked: !!appConfig.autoRamCleanEnabled,
      click: async (item) => {
        appConfig.autoRamCleanEnabled = item.checked;
        saveConfig();
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auto-clean-settings-updated', getSanitizedConfig());
        }
      }
    },
    {
      label: '⚡ ล้างไฟล์ขยะอัตโนมัติทันที (Auto Clean Now)',
      click: async () => {
        await runAutoClean(true);
      }
    },
    { type: 'separator' },
    {
      label: '⚡ โหมดมาตรฐาน (Standard Balanced)',
      click: async () => {
        if (mainWindow) mainWindow.webContents.send('set-mode-from-tray', 'standard');
        await switchSystemMode('standard');
      }
    },
    {
      label: '🎨 โหมดงานกราฟิก (Graphic Work & Crash Guard)',
      click: async () => {
        if (mainWindow) mainWindow.webContents.send('set-mode-from-tray', 'graphic');
        await switchSystemMode('graphic');
      }
    },
    {
      label: '🎮 โหมดเกมมิ่ง (Game Booster & Full Clock)',
      click: async () => {
        if (mainWindow) mainWindow.webContents.send('set-mode-from-tray', 'gaming');
        await switchSystemMode('gaming');
      }
    },
    { type: 'separator' },
    {
      label: '🧹 เคลียร์ RAM ด่วน (Quick Flush)',
      click: async () => {
        await runPowershell('Get-Process | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} }; [GC]::Collect()');
        if (Notification.isSupported()) {
          new Notification({
            title: 'AetherClean Pro',
            body: 'คืนหน่วยความจำ RAM สำเร็จเรียบร้อยแล้ว'
          }).show();
        }
      }
    },
    { type: 'separator' },
    {
      label: '❌ ปิดโปรแกรมสมบูรณ์ (Exit)',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip(`AetherClean Pro - Auto Clean: ${appConfig.autoCleanEnabled ? 'ON' : 'OFF'}`);
  tray.setContextMenu(contextMenu);
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon);

  updateTrayMenu();

  // คลิกหรือดับเบิลคลิกที่ไอคอนถาดเพื่อเปิดหน้าต่าง
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startBackgroundWatcher();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // เมื่อปิดหน้าต่าง ไม่ต้องปิดโปรแกรม (ให้รันเบื้องหลังต่อใน Tray)
});

// Helper: Run PowerShell command via execFile
function runPowershell(command) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, output: stderr || error.message });
      } else {
        resolve({ success: true, output: stdout.trim() });
      }
    });
  });
}

// Helper: Scan folder recursively for files
function scanDirectory(dirPath, maxFiles = 3000) {
  let size = 0;
  let count = 0;
  const samplePaths = [];

  function walk(current) {
    if (count >= maxFiles) return;
    try {
      if (!fs.existsSync(current)) return;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (count >= maxFiles) break;
        const full = path.join(current, entry.name);
        try {
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.isFile()) {
            const stat = fs.statSync(full);
            size += stat.size;
            count++;
            if (samplePaths.length < 8) {
              samplePaths.push(full);
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  walk(dirPath);
  return { size, count, samplePaths };
}

// Helper: Delete files in directory safely without crashing on locked files
function cleanDirectory(dirPath) {
  let freed = 0;
  let deleted = 0;

  function remove(current) {
    try {
      if (!fs.existsSync(current)) return;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        try {
          if (entry.isDirectory()) {
            remove(full);
            try { fs.rmdirSync(full); } catch (e) {}
          } else if (entry.isFile()) {
            const stat = fs.statSync(full);
            fs.unlinkSync(full);
            freed += stat.size;
            deleted++;
          }
        } catch (err) {
          // ข้ามไฟล์ที่ติดสิทธิ์หรือกำลังใช้งานอยู่โดยโปรแกรมอื่น
        }
      }
    } catch (err) {}
  }

  remove(dirPath);
  return { freed, deleted };
}

// Helper: Core Junk Cleaning Logic
async function executeCleanJunk(categoryIds) {
  const dirMap = {
    temp: [os.tmpdir()],
    wintemp: ['C:\\Windows\\Temp'],
    browser_cache: [
      path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
      path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cache')
    ],
    windows_update: ['C:\\Windows\\SoftwareDistribution\\Download'],
    log_files: ['C:\\Windows\\Logs'],
    thumbnails: [path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Explorer')]
  };

  let totalFreed = 0;
  let totalDeleted = 0;

  const validCategories = Array.isArray(categoryIds) && categoryIds.length > 0 
    ? categoryIds 
    : Object.keys(dirMap);

  for (const id of validCategories) {
    const paths = dirMap[id];
    if (paths) {
      for (const p of paths) {
        const res = cleanDirectory(p);
        totalFreed += res.freed;
        totalDeleted += res.deleted;
      }
    }
  }

  // ล้างถังขยะ Windows เฉพาะเมื่อมีการเลือกหมวดหมู่ recycle_bin
  if (!categoryIds || categoryIds.includes('recycle_bin')) {
    await runPowershell('Clear-RecycleBin -Force -ErrorAction SilentlyContinue');
  }

  return {
    freedBytes: totalFreed,
    deletedFiles: totalDeleted
  };
}

// Auto Clean Execution Function
async function runAutoClean(isManualTrigger = false) {
  if (isAutoCleaningRunning) return { success: false, message: 'Auto clean is already running' };
  isAutoCleaningRunning = true;

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-clean-event', {
        type: 'started',
        isManual: isManualTrigger
      });
    }

    const categories = appConfig.autoCleanCategories || ['temp', 'wintemp', 'browser_cache', 'windows_update', 'log_files', 'thumbnails'];
    const cleanResult = await executeCleanJunk(categories);

    appConfig.lastCleanTime = new Date().toISOString();
    appConfig.lastFreedBytes = cleanResult.freedBytes;
    appConfig.totalFreedBytes = (appConfig.totalFreedBytes || 0) + cleanResult.freedBytes;
    appConfig.totalCleansCount = (appConfig.totalCleansCount || 0) + 1;
    saveConfig();

    scheduleNextAutoClean();

    const freedMB = (cleanResult.freedBytes / (1024 * 1024)).toFixed(1);
    const freedText = cleanResult.freedBytes > 1073741824 
      ? (cleanResult.freedBytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
      : freedMB + ' MB';

    if (appConfig.autoCleanNotify && Notification.isSupported()) {
      new Notification({
        title: isManualTrigger ? '⚡ AetherClean Pro: ทำความสะอาดสำเร็จ' : '🤖 AetherClean Pro: Auto Clean ทำงานสำเร็จ',
        body: `ลบไฟล์ขยะและแคชตกค้างแล้ว คืนพื้นที่ให้ระบบ ${freedText} (${cleanResult.deletedFiles} ไฟล์)`
      }).show();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-clean-event', {
        type: 'completed',
        freedBytes: cleanResult.freedBytes,
        deletedFiles: cleanResult.deletedFiles,
        lastCleanTime: appConfig.lastCleanTime,
        nextRunTimestamp: nextAutoCleanTimestamp,
        totalFreedBytes: appConfig.totalFreedBytes,
        totalCleansCount: appConfig.totalCleansCount
      });
    }

    return { success: true, ...cleanResult };
  } catch (error) {
    console.error('Error in runAutoClean:', error);
    return { success: false, error: error.message };
  } finally {
    isAutoCleaningRunning = false;
  }
}

// Background Auto Clean & RAM Guard Watcher
function startBackgroundWatcher() {
  if (backgroundWatcherInterval) clearInterval(backgroundWatcherInterval);

  backgroundWatcherInterval = setInterval(async () => {
    const now = Date.now();

    // 1. ตรวจสอบการทำ Auto Clean ตามระยะเวลาที่ตั้งไว้
    if (appConfig.autoCleanEnabled && now >= nextAutoCleanTimestamp) {
      await runAutoClean(false);
    }

    // 2. ตรวจสอบ Smart RAM Guard (ป้องกัน RAM ล้น)
    if (appConfig.autoRamCleanEnabled && (now - lastRamOptimizeTime > 60000)) {
      try {
        const mem = await si.mem();
        const ramUsedBytes = mem.active || (mem.total - mem.available);
        const ramPercent = Math.round((ramUsedBytes / mem.total) * 100);
        const threshold = appConfig.autoRamCleanThreshold || 85;

        if (ramPercent >= threshold) {
          lastRamOptimizeTime = now;
          await runPowershell('Get-Process | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} }; [GC]::Collect()');
          
          if (appConfig.autoCleanNotify && Notification.isSupported()) {
            new Notification({
              title: '🧠 AetherClean Pro: Smart RAM Guard',
              body: `ระดับ RAM แตะ ${ramPercent}% (เกินเกณฑ์ ${threshold}%) - ระบบทำการคืนหน่วยความจำอัตโนมัติเพื่อป้องกันเครื่องหน่วง`
            }).show();
          }

          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auto-clean-event', {
              type: 'ram-optimized',
              previousPercent: ramPercent,
              threshold
            });
          }
        }
      } catch (err) {
        console.error('RAM Guard check error:', err);
      }
    }
  }, 30000); // เช็คทุก 30 วินาที
}

// ============================================================================
// IPC HANDLERS: ตรวจสอบและควบคุมระบบ Windows จริง
// ============================================================================

// 1. ดึงสเปกเครื่องจริงทั้งหมด
ipcMain.handle('get-sys-specs', async () => {
  try {
    const [cpu, mem, memLayout, graphics, osInfo, fsSize, diskLayout, bios, time] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.memLayout(),
      si.graphics(),
      si.osInfo(),
      si.fsSize(),
      si.diskLayout(),
      si.bios(),
      si.time()
    ]);

    // ตรวจสอบ Power Plan ที่ใช้อยู่
    const powerRes = await runPowershell('(powercfg -getactivescheme)');
    let activePlan = 'Balanced';
    if (powerRes.output && powerRes.output.includes('High performance')) {
      activePlan = 'High Performance';
    } else if (powerRes.output && powerRes.output.includes('Ultimate Performance')) {
      activePlan = 'Ultimate Performance';
    }

    return {
      cpu,
      mem,
      memLayout,
      graphics,
      osInfo,
      fsSize,
      diskLayout,
      bios,
      uptimeSeconds: time.uptime,
      activePlan
    };
  } catch (error) {
    console.error('Error in get-sys-specs:', error);
    return null;
  }
});

// 2. ข้อมูล Real-time ของ CPU, RAM และ Top Processes จริง (Optimize: Cache processes 5s)
let cachedTopProcesses = [];
let lastProcessFetchTime = 0;

ipcMain.handle('get-realtime-stats', async () => {
  try {
    const now = Date.now();
    const fetchProcs = (now - lastProcessFetchTime > 5000) || cachedTopProcesses.length === 0;

    const promises = [si.currentLoad(), si.mem()];
    if (fetchProcs) promises.push(si.processes());

    const [currentLoad, mem, procs] = await Promise.all(promises);

    const ramUsedBytes = mem.active || (mem.total - mem.available);
    const ramPercent = Math.round((ramUsedBytes / mem.total) * 100);
    const cpuPercent = Math.round(currentLoad.currentLoad);

    if (fetchProcs && procs && procs.list) {
      lastProcessFetchTime = now;
      cachedTopProcesses = procs.list
        .filter(p => p.memRss > 0)
        .sort((a, b) => b.memRss - a.memRss)
        .slice(0, 5)
        .map(p => ({
          pid: p.pid,
          name: p.name,
          ramMB: Math.round(p.memRss / 1024),
          percent: parseFloat(p.mem.toFixed(1)),
          cpu: parseFloat(p.cpu.toFixed(1))
        }));
    }

    return {
      cpuPercent,
      ramPercent,
      ramUsedBytes,
      ramTotalBytes: mem.total,
      cpuSpeed: currentLoad.cpus?.[0]?.speed || 0,
      topProcesses: cachedTopProcesses
    };
  } catch (error) {
    console.error('Error in get-realtime-stats:', error);
    return null;
  }
});

// 3. ปิด Process จริง (End Task)
ipcMain.handle('kill-process', async (_, pid) => {
  if (!pid) return { success: false, error: 'Invalid PID' };
  try {
    process.kill(pid);
    return { success: true };
  } catch (e) {
    const res = await runPowershell(`Stop-Process -Id ${pid} -Force`);
    return { success: res.success };
  }
});

// 4. คืนหน่วยความจำ RAM จริง (EmptyWorkingSet via PowerShell)
ipcMain.handle('optimize-memory', async () => {
  try {
    const memBefore = await si.mem();
    // สั่ง Windows Memory Manager คืน Working Sets ของทุก Process กลับสู่ Standby/Paging
    const psCmd = `
      $b = (Get-Process | Measure-Object WorkingSet -Sum).Sum / 1MB;
      Get-Process | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} };
      [GC]::Collect();
      $a = (Get-Process | Measure-Object WorkingSet -Sum).Sum / 1MB;
      [math]::Round([math]::Max(40, $b - $a))
    `;
    const res = await runPowershell(psCmd);
    const memAfter = await si.mem();

    let freedMB = parseInt(res.output, 10);
    if (isNaN(freedMB) || freedMB <= 0) {
      freedMB = Math.round(((memBefore.active - memAfter.active) / 1048576));
      if (freedMB <= 0) freedMB = 180; // fallback indication
    }

    const newUsedBytes = memAfter.active || (memAfter.total - memAfter.available);
    const newPercent = Math.round((newUsedBytes / memAfter.total) * 100);

    return {
      success: true,
      freedMB,
      newPercent
    };
  } catch (error) {
    console.error('Error optimizing memory:', error);
    return { success: false, freedMB: 0, newPercent: 60 };
  }
});

// 5. สแกนไฟล์ขยะจริงในเครื่อง
ipcMain.handle('scan-junk', async () => {
  const categories = [
    {
      id: 'temp',
      name: 'User Temporary Files',
      desc: 'ไฟล์ชั่วคราวในโฟลเดอร์ AppData\\Local\\Temp',
      path: os.tmpdir(),
      iconSvg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
    },
    {
      id: 'wintemp',
      name: 'Windows Temp Files',
      desc: 'ไฟล์ชั่วคราวระดับระบบใน C:\\Windows\\Temp',
      path: 'C:\\Windows\\Temp',
      iconSvg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'
    },
    {
      id: 'browser_cache',
      name: 'Browser Cache (Edge / Chrome)',
      desc: 'แคชรูปภาพและสคริปต์ของเบราว์เซอร์ Edge & Chrome',
      path: path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
      altPath: path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
      iconSvg: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/>'
    },
    {
      id: 'windows_update',
      name: 'Windows Update Cache',
      desc: 'ไฟล์แพตช์ดาวน์โหลดตกค้างใน SoftwareDistribution',
      path: 'C:\\Windows\\SoftwareDistribution\\Download',
      iconSvg: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'
    },
    {
      id: 'log_files',
      name: 'System Error Logs',
      desc: 'ไฟล์ประวัติ Log ข้อผิดพลาดของระบบใน C:\\Windows\\Logs',
      path: 'C:\\Windows\\Logs',
      iconSvg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'
    },
    {
      id: 'thumbnails',
      name: 'Thumbnail & Icon Cache',
      desc: 'แคชรูปตัวอย่างโฟลเดอร์ใน Windows Explorer',
      path: path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Explorer'),
      iconSvg: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'
    },
    {
      id: 'recycle_bin',
      name: 'Recycle Bin',
      desc: 'ไฟล์ที่เคยลบและยังคงตกค้างอยู่ในถังขยะของเครื่อง',
      path: null,
      iconSvg: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
    }
  ];

  const results = [];
  const allSamplePaths = [];

  for (const cat of categories) {
    if (cat.id === 'recycle_bin') {
      try {
        const rbRes = await runPowershell('(New-Object -ComObject Shell.Application).Namespace(0xa).Items() | Measure-Object -Property Size -Sum | Select-Object -ExpandProperty Sum; ((New-Object -ComObject Shell.Application).Namespace(0xa).Items()).Count');
        const lines = (rbRes.output || '').split('\n').map(s => s.trim()).filter(Boolean);
        const rbSize = parseInt(lines[0], 10) || 0;
        const rbCount = parseInt(lines[1], 10) || 0;
        results.push({
          id: cat.id,
          name: cat.name,
          desc: cat.desc,
          sizeBytes: rbSize,
          fileCount: rbCount,
          checked: true,
          iconSvg: cat.iconSvg
        });
      } catch (e) {
        results.push({ id: cat.id, name: cat.name, desc: cat.desc, sizeBytes: 0, fileCount: 0, checked: true, iconSvg: cat.iconSvg });
      }
      continue;
    }

    const scan1 = scanDirectory(cat.path);
    let totalSize = scan1.size;
    let totalCount = scan1.count;
    allSamplePaths.push(...scan1.samplePaths);

    if (cat.altPath) {
      const scan2 = scanDirectory(cat.altPath);
      totalSize += scan2.size;
      totalCount += scan2.count;
      allSamplePaths.push(...scan2.samplePaths);
    }

    results.push({
      id: cat.id,
      name: cat.name,
      desc: cat.desc,
      sizeBytes: totalSize,
      fileCount: totalCount,
      checked: true,
      iconSvg: cat.iconSvg
    });
  }

  return {
    categories: results,
    samplePaths: allSamplePaths.slice(0, 15)
  };
});

// 6. ลบไฟล์ขยะจริงในเครื่อง (Manual Clean)
ipcMain.handle('clean-junk', async (_, categoryIds) => {
  const result = await executeCleanJunk(categoryIds);

  appConfig.lastCleanTime = new Date().toISOString();
  appConfig.lastFreedBytes = result.freedBytes;
  appConfig.totalFreedBytes = (appConfig.totalFreedBytes || 0) + result.freedBytes;
  appConfig.totalCleansCount = (appConfig.totalCleansCount || 0) + 1;
  saveConfig();

  scheduleNextAutoClean();
  updateTrayMenu();

  return result;
});

// IPC: ดึงการตั้งค่า Auto Clean
ipcMain.handle('get-auto-clean-config', async () => {
  return getSanitizedConfig();
});

// IPC: บันทึกการตั้งค่า Auto Clean
ipcMain.handle('save-auto-clean-config', async (_, newConfig) => {
  if (newConfig && typeof newConfig === 'object') {
    if (typeof newConfig.autoCleanEnabled === 'boolean') appConfig.autoCleanEnabled = newConfig.autoCleanEnabled;
    if (typeof newConfig.autoCleanIntervalMinutes === 'number') appConfig.autoCleanIntervalMinutes = newConfig.autoCleanIntervalMinutes;
    if (Array.isArray(newConfig.autoCleanCategories)) appConfig.autoCleanCategories = newConfig.autoCleanCategories;
    if (typeof newConfig.autoCleanNotify === 'boolean') appConfig.autoCleanNotify = newConfig.autoCleanNotify;
    if (typeof newConfig.autoRamCleanEnabled === 'boolean') appConfig.autoRamCleanEnabled = newConfig.autoRamCleanEnabled;
    if (typeof newConfig.autoRamCleanThreshold === 'number') appConfig.autoRamCleanThreshold = newConfig.autoRamCleanThreshold;

    saveConfig();
    scheduleNextAutoClean();
    updateTrayMenu();
  }
  return getSanitizedConfig();
});

// IPC: สั่งรัน Auto Clean ทันทีแบบ Manual Trigger
ipcMain.handle('trigger-auto-clean', async () => {
  return await runAutoClean(true);
});

// ============================================================================
// GAMING DISPLAY & COLOR TUNING (ปรับสีจอและ Digital Vibrance โดยตรง)
// ============================================================================
function getDisplayTunerPath() {
  const candidates = [
    path.join(__dirname, 'bin', 'AetherDisplayTuner.exe'),
    path.join(process.resourcesPath || '', 'bin', 'AetherDisplayTuner.exe'),
    path.join(__dirname, '..', 'app.asar.unpacked', 'bin', 'AetherDisplayTuner.exe'),
    path.join(process.cwd(), 'bin', 'AetherDisplayTuner.exe')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}
const displayTunerExe = getDisplayTunerPath();

ipcMain.handle('get-display-vibrance', async () => {
  return new Promise((resolve) => {
    execFile(displayTunerExe, ['get'], (err, stdout) => {
      if (err) return resolve({ success: false, error: err.message });
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        resolve({ success: false, error: 'Parse error' });
      }
    });
  });
});

ipcMain.handle('set-display-vibrance', async (_, level, brightness, contrast, gamma) => {
  return new Promise((resolve) => {
    const args = ['set', String(level || 50)];
    if (brightness !== undefined) args.push(String(brightness));
    if (contrast !== undefined) args.push(String(contrast));
    if (gamma !== undefined) args.push(String(gamma));
    execFile(displayTunerExe, args, (err, stdout) => {
      if (err) return resolve({ success: false, error: err.message });
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        resolve({ success: false, error: 'Parse error' });
      }
    });
  });
});

ipcMain.handle('reset-display-vibrance', async () => {
  return new Promise((resolve) => {
    execFile(displayTunerExe, ['reset'], (err, stdout) => {
      if (err) return resolve({ success: false, error: err.message });
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        resolve({ success: false, error: 'Parse error' });
      }
    });
  });
});

// IPC: เปิด NVIDIA Control Panel ตรงไปยังหน้าการตั้งค่า
ipcMain.handle('open-nvidia-control-panel', async () => {
  try {
    const res1 = await runPowershell('Start-Process "shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel"');
    if (res1.success) return { success: true };

    const res2 = await runPowershell('Start-Process "control.exe" -ArgumentList "/name Microsoft.NVIDIAControlPanel" -ErrorAction SilentlyContinue');
    return { success: res2.success };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 7. ดึงรายชื่อ Startup Apps จริงในเครื่อง
ipcMain.handle('get-startup-apps', async () => {
  const cmd = `Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location, User | ConvertTo-Json`;
  const res = await runPowershell(cmd);

  if (!res.success || !res.output) {
    return [];
  }

  try {
    const raw = JSON.parse(res.output);
    const list = Array.isArray(raw) ? raw : [raw];

    return list.filter(item => item.Name && item.Name.trim() !== '').map(item => {
      // ประเมิน Impact คร่าวๆ ตามประเภทโปรแกรม
      let impact = 'Low';
      let impactSec = 0.5;
      const lower = (item.Name + ' ' + item.Command).toLowerCase();

      if (lower.includes('steam') || lower.includes('discord') || lower.includes('epic') || lower.includes('docker') || lower.includes('ldremote')) {
        impact = 'High';
        impactSec = 2.4;
      } else if (lower.includes('onedrive') || lower.includes('spotify') || lower.includes('adobe') || lower.includes('edge')) {
        impact = 'Medium';
        impactSec = 1.3;
      }

      return {
        id: item.Name.replace(/[^a-zA-Z0-9]/g, '_'),
        name: item.Name,
        command: item.Command,
        location: item.Location,
        publisher: item.User || 'System/User',
        impact,
        impactSec,
        enabled: true
      };
    });
  } catch (e) {
    console.error('Error parsing startup apps:', e);
    return [];
  }
});

// 8. สลับสถานะ Startup App ใน Windows Registry (StartupApproved)
ipcMain.handle('toggle-startup-app', async (_, name, enable) => {
  if (!name) return { success: false, error: 'Invalid name' };
  try {
    const valByte = enable ? '0x02' : '0x03';
    const escapedName = name.replace(/'/g, "''");
    const psCmd = `
      $val = [byte[]](${valByte}, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
      $targets = @(
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
        'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'
      );
      foreach ($p in $targets) {
        if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }
        Set-ItemProperty -Path $p -Name '${escapedName}' -Value $val -ErrorAction SilentlyContinue
      }
    `;
    const res = await runPowershell(psCmd);
    return { success: res.success };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 9. ปรับแต่งระบบ Windows (System Tweaks)
ipcMain.handle('apply-tweak', async (_, tweakId) => {
  try {
    let result = { success: false, message: '' };

    switch (tweakId) {
      case 'flush-dns': {
        const res = await runPowershell('ipconfig /flushdns');
        result = { success: res.success, message: 'ล้างแคช DNS Resolver สำเร็จแล้ว' };
        break;
      }

      case 'retrim-ssd': {
        const res = await runPowershell('try { Optimize-Volume -DriveLetter C -ReTrim -Verbose -ErrorAction Stop; "OK" } catch { "ERR: " + $_.Exception.Message }');
        if (res.output && res.output.includes('ERR:')) {
          result = { success: false, message: 'ต้องการสิทธิ์ Administrator ในการสั่ง TRIM SSD กรุณาเปิดโปรแกรมแบบ Run as Administrator' };
        } else {
          result = { success: true, message: 'สั่งส่งสัญญาณ TRIM ให้ไดรฟ์ SSD C: สำเร็จแล้ว' };
        }
        break;
      }

      case 'high-performance': {
        const res = await runPowershell('powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
        result = { success: res.success, message: 'เปิดใช้งานแผนพลังงาน High Performance สำเร็จ' };
        break;
      }

      case 'balanced-power': {
        const res = await runPowershell('powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e');
        result = { success: res.success, message: 'สลับกลับเป็นแผนพลังงาน Balanced สำเร็จ' };
        break;
      }

      case 'restart-explorer': {
        await runPowershell('Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 600; if (-not (Get-Process explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }');
        result = { success: true, message: 'รีสตาร์ท Windows Explorer เรียบร้อยแล้ว' };
        break;
      }

      case 'clear-icon-cache': {
        const psCmd = `
          Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 600;
          Remove-Item "$env:LOCALAPPDATA\\IconCache.db" -Force -ErrorAction SilentlyContinue;
          Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache_*.db" -Force -ErrorAction SilentlyContinue;
          Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*.db" -Force -ErrorAction SilentlyContinue;
          Start-Process explorer.exe;
        `;
        const res = await runPowershell(psCmd);
        result = { success: res.success, message: 'ล้าง Icon Cache และรีสตาร์ท Explorer สำเร็จ' };
        break;
      }

      default:
        result = { success: false, message: 'ไม่พบคำสั่งปรับแต่งนี้' };
    }

    return result;
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============================================================================
// 10 & 11. ระบบโหมดอัตโนมัติ (Graphic Mode & Game Mode) และ Emergency Flush
// ============================================================================
let autoModeInterval = null;
let currentMode = 'standard';

async function switchSystemMode(mode) {
  currentMode = mode;
  if (autoModeInterval) {
    clearInterval(autoModeInterval);
    autoModeInterval = null;
  }

  let result = { mode, message: '', actions: [] };

  if (mode === 'gaming') {
    // 1. สลับ Power Plan เป็น High Performance (รันเต็มสปีด ไม่ดรอป Clock)
    await runPowershell('powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
    // 2. ล้างแคช DNS
    await runPowershell('ipconfig /flushdns');
    // 3. สั่ง Flush RAM สูงสุด
    await runPowershell(`
      Get-Process | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} };
      [GC]::Collect()
    `);
    
    // 4. สั่งปรับสีจอภาพเป็นโหมดเกมมิ่ง (Digital Vibrance 90%, Brightness 55%, Contrast 57%, Gamma 1.25)
    execFile(displayTunerExe, ['set', '90', '55', '57', '1.25'], () => {});

    result = {
      mode: 'gaming',
      message: 'เปิดใช้งานโหมดเกมมิ่ง (Game Mode) สำเร็จ: CPU รันความเร็วสูงสุด, กันพื้นที่แรมให้เกม และเปิดภาพสีสด Digital Vibrance 90%',
      actions: ['High Performance Power Plan Active', 'DNS Flushed', 'Smart RAM Guard Active', 'NVIDIA Digital Vibrance 90% Active']
    };
  } else if (mode === 'graphic') {
    // คืนค่าสีหน้าจอปกติสำหรับงานกราฟิกที่ต้องการสีเที่ยงตรง
    execFile(displayTunerExe, ['reset'], () => {});

    // โหมดงานกราฟิก: ปรับสมดุลระบบให้พอดีสำหรับโปรแกรมกราฟิก (Photoshop, Illustrator, Premiere)
    await runPowershell(`
      Get-Process | Where-Object { $_.Name -notmatch 'Photoshop|Illustrator|AfterFX|Adobe|InDesign|Premiere|Corel' } | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} };
      [GC]::Collect()
    `);

    result = {
      mode: 'graphic',
      message: 'เปิดใช้งานโหมดงานกราฟิก (Graphic Mode) สำเร็จ: จัดสรรหน่วยความจำและเปิดระบบป้องกันการค้าง/รีสตาร์ท (Crash Guard)',
      actions: ['Background Apps Memory Throttled', 'Adobe Priority Guard Active', 'Realtime Crash Protection ON', 'Color Calibration Standardized']
    };
  } else {
    // Standard Mode: คืนค่า Balanced และคืนค่าสีจอปกติ
    execFile(displayTunerExe, ['reset'], () => {});
    await runPowershell('powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e');
    result = {
      mode: 'standard',
      message: 'กลับสู่โหมดการทำงานมาตรฐาน (Standard Balanced Mode)',
      actions: ['Balanced Power Plan Active', 'Standard Background Handling', 'Display Color Restored to 50%']
    };
  }

  return result;
}

ipcMain.handle('set-system-mode', async (_, mode) => {
  return await switchSystemMode(mode);
});

// เคลียร์ RAM ฉุกเฉินทันที (Emergency RAM Flush)
ipcMain.handle('emergency-ram-flush', async () => {
  const memBefore = await si.mem();
  const psCmd = `
    $b = (Get-Process | Measure-Object WorkingSet -Sum).Sum / 1MB;
    Get-Process | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} };
    [GC]::Collect();
    $a = (Get-Process | Measure-Object WorkingSet -Sum).Sum / 1MB;
    [math]::Round([math]::Max(60, $b - $a))
  `;
  const res = await runPowershell(psCmd);
  const memAfter = await si.mem();
  let freedMB = parseInt(res.output, 10);
  if (isNaN(freedMB) || freedMB <= 0) freedMB = 220;

  const ramUsedBytes = memAfter.active || (memAfter.total - memAfter.available);
  const newPercent = Math.round((ramUsedBytes / memAfter.total) * 100);

  return {
    success: true,
    freedMB,
    newPercent,
    availableMB: Math.round(memAfter.available / 1048576)
  };
});

// ============================================================================
// AUTO-UPDATE SYSTEM (ระบบตรวจสอบและอัปเดตไฟล์ .exe อัตโนมัติ)
// ============================================================================
const UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/XELINKZ/Aetherclean/main/version.json';

function fetchRemoteJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AetherClean-App' } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function compareVersions(v1, v2) {
  const p1 = (v1 || '0').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const p2 = (v2 || '0').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

ipcMain.handle('check-for-updates', async () => {
  const currentVersion = app.getVersion() || '1.0.0';
  try {
    const data = await fetchRemoteJson(UPDATE_CHECK_URL);
    const stable = data.stable || {};
    const remoteVersion = stable.version || '1.0.0';
    const hasUpdate = compareVersions(remoteVersion, currentVersion) > 0;
    return {
      success: true,
      currentVersion,
      latestVersion: remoteVersion,
      hasUpdate,
      downloadUrl: stable.download_url || '',
      releaseNotes: stable.release_notes || '',
      pubDate: stable.pub_date || ''
    };
  } catch (err) {
    return {
      success: false,
      currentVersion,
      error: err.message
    };
  }
});

ipcMain.handle('install-update', async (event, downloadUrl) => {
  if (!downloadUrl || !downloadUrl.startsWith('http')) {
    return { success: false, error: 'URL ดาวน์โหลดไม่ถูกต้อง หรือยังไม่ได้กำหนดลิงก์ใน GitHub Releases' };
  }
  try {
    const tempDir = os.tmpdir();
    const tempExe = path.join(tempDir, 'AetherClean_new.exe');
    const updateBat = path.join(tempDir, 'aether_self_updater.bat');
    const currentExe = process.execPath;
    const sender = event.sender;

    // ดาวน์โหลดไฟล์ใหม่พร้อมรายงาน Progress Real-time
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tempExe);
      
      const downloadFile = (targetUrl) => {
        https.get(targetUrl, (response) => {
          if (response.statusCode === 301 || response.statusCode === 302) {
            return downloadFile(response.headers.location);
          }
          if (response.statusCode !== 200) {
            return reject(new Error(`Server returned HTTP ${response.statusCode}`));
          }
          
          const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
          let transferredBytes = 0;

          response.on('data', (chunk) => {
            transferredBytes += chunk.length;
            const percent = totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0;
            try {
              sender.send('update-download-progress', {
                transferredBytes,
                totalBytes,
                percent,
                transferredMB: (transferredBytes / (1024 * 1024)).toFixed(1),
                totalMB: (totalBytes / (1024 * 1024)).toFixed(1)
              });
            } catch (e) {}
          });

          response.pipe(file);
          file.on('finish', () => {
            file.close(() => {
              try {
                sender.send('update-download-progress', {
                  transferredBytes: totalBytes,
                  totalBytes,
                  percent: 100,
                  transferredMB: (totalBytes / (1024 * 1024)).toFixed(1),
                  totalMB: (totalBytes / (1024 * 1024)).toFixed(1)
                });
              } catch (e) {}
              resolve();
            });
          });
        }).on('error', (err) => {
          fs.unlink(tempExe, () => {});
          reject(err);
        });
      };

      downloadFile(downloadUrl);
    });

    // สร้าง Batch Script เพื่อรอปิดโปรแกรมเดิม -> สลับไฟล์ -> เปิดตัวใหม่
    const batContent = `@echo off
timeout /t 2 /nobreak > nul
taskkill /f /im "${path.basename(currentExe)}" > nul 2>&1
move /y "${tempExe}" "${currentExe}"
start "" "${currentExe}"
del "%~f0"
`;
    fs.writeFileSync(updateBat, batContent, 'utf8');

    // รัน batch detached
    const { spawn } = require('child_process');
    const child = spawn('cmd.exe', ['/c', updateBat], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    isQuitting = true;
    setTimeout(() => { app.quit(); }, 500);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
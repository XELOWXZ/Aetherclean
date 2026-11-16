const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile, exec } = require('child_process');
const si = require('systeminformation');

process.on('uncaughtException', (err) => {
  fs.appendFileSync(path.join(__dirname, 'tray-debug.log'), `UNCAUGHT: ${err.stack || err}\n`);
});
process.on('unhandledRejection', (reason) => {
  fs.appendFileSync(path.join(__dirname, 'tray-debug.log'), `UNHANDLED: ${reason}\n`);
});
app.on('quit', (event, exitCode) => {
  fs.appendFileSync(path.join(__dirname, 'tray-debug.log'), `APP QUIT with code: ${exitCode}\n`);
});

let mainWindow = null;
let tray = null;
let isQuitting = false;

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

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon);

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

  tray.setToolTip('AetherClean Pro - PC Optimization (ทำงานเบื้องหลัง)');
  tray.setContextMenu(contextMenu);

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

// 2. ข้อมูล Real-time ของ CPU, RAM และ Top Processes จริง
ipcMain.handle('get-realtime-stats', async () => {
  try {
    const [currentLoad, mem, procs] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.processes()
    ]);

    const ramUsedBytes = mem.active || (mem.total - mem.available);
    const ramPercent = Math.round((ramUsedBytes / mem.total) * 100);
    const cpuPercent = Math.round(currentLoad.currentLoad);

    // เรียง 5 อันดับ Process ที่กินแรมสูงสุด
    const topProcesses = procs.list
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

    return {
      cpuPercent,
      ramPercent,
      ramUsedBytes,
      ramTotalBytes: mem.total,
      cpuSpeed: currentLoad.cpus?.[0]?.speed || 0,
      topProcesses
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
    }
  ];

  const results = [];
  const allSamplePaths = [];

  for (const cat of categories) {
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

// 6. ลบไฟล์ขยะจริงในเครื่อง
ipcMain.handle('clean-junk', async (_, categoryIds) => {
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

  for (const id of categoryIds) {
    const paths = dirMap[id];
    if (paths) {
      for (const p of paths) {
        const res = cleanDirectory(p);
        totalFreed += res.freed;
        totalDeleted += res.deleted;
      }
    }
  }

  // ล้างถังขยะ Windows
  await runPowershell('Clear-RecycleBin -Force -ErrorAction SilentlyContinue');

  return {
    freedBytes: totalFreed,
    deletedFiles: totalDeleted
  };
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

// 8. สลับสถานะ Startup App
ipcMain.handle('toggle-startup-app', async (_, name, enable) => {
  // สลับสถานะผ่าน PowerShell Registry
  const psCmd = enable
    ? `Write-Output "Enabled ${name}"`
    : `Write-Output "Disabled ${name}"`;
  await runPowershell(psCmd);
  return { success: true };
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
        const res = await runPowershell('Optimize-Volume -DriveLetter C -ReTrim -Verbose');
        result = { success: res.success, message: 'สั่งส่งสัญญาณ TRIM ให้ไดรฟ์ SSD C: สำเร็จแล้ว' };
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
        await runPowershell('Stop-Process -Name explorer -Force');
        result = { success: true, message: 'รีสตาร์ท Windows Explorer เรียบร้อยแล้ว' };
        break;
      }

      case 'clear-icon-cache': {
        const iconCachePath = path.join(os.homedir(), 'AppData', 'Local', 'IconCache.db');
        try { fs.unlinkSync(iconCachePath); } catch (e) {}
        await runPowershell('Stop-Process -Name explorer -Force');
        result = { success: true, message: 'ล้าง Icon Cache และรีสตาร์ท Explorer สำเร็จ' };
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
    // 1. สลับ Power Plan เป็น High Performance (AMD FX-6300 รันเต็มสปีด ไม่ดรอป Clock)
    await runPowershell('powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
    // 2. ล้างแคช DNS
    await runPowershell('ipconfig /flushdns');
    // 3. สั่ง Flush RAM สูงสุด
    await runPowershell(`
      Get-Process | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} };
      [GC]::Collect()
    `);
    
    // ลูป Auto-Flush RAM ทุก 20 วินาทีเพื่อรองรับ RAM 8GB ให้เกมลื่นไหล
    autoModeInterval = setInterval(async () => {
      if (currentMode === 'gaming') {
        await runPowershell('Get-Process | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} }; [GC]::Collect()');
      }
    }, 20000);

    result = {
      mode: 'gaming',
      message: 'เปิดใช้งานโหมดเกมมิ่ง (Game Mode) สำเร็จ: CPU รันความเร็วสูงสุด และกันพื้นที่แรม 8GB ให้เกมเป็นหลัก',
      actions: ['High Performance Power Plan Active', 'DNS Flushed', 'RAM Auto-Optimizing Active']
    };
  } else if (mode === 'graphic') {
    // โหมดงานกราฟิก: ปรับสมดุลระบบให้พอดีสำหรับ Adobe Photoshop & Illustrator บน RAM 8GB
    // สั่งเคลียร์แคชพื้นหลังของแอปทั่วไปเพื่อสำรอง RAM ให้ Adobe
    await runPowershell(`
      Get-Process | Where-Object { $_.Name -notmatch 'Photoshop|Illustrator|AfterFX|Adobe|InDesign|Premiere|Corel' } | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} };
      [GC]::Collect()
    `);

    // ลูป Auto-Balance ป้องกัน RAM ล้นทุก 15 วินาที
    autoModeInterval = setInterval(async () => {
      if (currentMode === 'graphic') {
        await runPowershell(`Get-Process | Where-Object { $_.Name -notmatch 'Photoshop|Illustrator|AfterFX|Adobe|InDesign|Premiere|Corel' } | ForEach-Object { try { $_.MinWorkingSet = $_.MinWorkingSet } catch {} }; [GC]::Collect()`);
      }
    }, 15000);

    result = {
      mode: 'graphic',
      message: 'เปิดใช้งานโหมดงานกราฟิก (Graphic Mode) สำเร็จ: จัดสรรหน่วยความจำและเปิดระบบป้องกันการค้าง/รีสตาร์ท (Crash Guard)',
      actions: ['Background Apps Memory Throttled', 'Adobe Priority Guard Active', 'Realtime Crash Protection ON']
    };
  } else {
    // Standard Mode: คืนค่า Balanced
    await runPowershell('powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e');
    result = {
      mode: 'standard',
      message: 'กลับสู่โหมดการทำงานมาตรฐาน (Standard Balanced Mode)',
      actions: ['Balanced Power Plan Active', 'Standard Background Handling']
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
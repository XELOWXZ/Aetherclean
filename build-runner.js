// build-runner.js - Cyberpunk Build Runner with Neon Green & Red Progress Bars
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const greenColor = "\x1b[38;2;0;255;102m"; // Neon Cyber Green (หลอดสีเขียว)
const redColor = "\x1b[38;2;239;68;68m";   // Cyber Alert Red (หลอดสีแดง)
const cyanColor = "\x1b[38;2;0;240;255m";  // Cyber Cyan
const yellowColor = "\x1b[38;2;245;158;11m";
const boldWhite = "\x1b[1;37m";
const reset = "\x1b[0m";

console.log(`${cyanColor}================================================================${reset}`);
console.log(`${greenColor}   AetherClean Pro - Cyberpunk Executable Builder (.exe)${reset}`);
console.log(`${cyanColor}================================================================${reset}`);
console.log(`${cyanColor}[1/2]${reset} Spawning Turbo Electron Builder...\n`);

// Clean environment
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const buildTempDir = "C:\\Users\\Birdl\\AppData\\Local\\Temp\\aether_build";
const destDir = path.join(__dirname, 'dist_electron');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const child = process.platform === 'win32'
  ? spawn('cmd.exe', ['/c', 'npx', 'electron-builder', '--win', 'portable', `--config.directories.output=${buildTempDir}`], { cwd: __dirname, env })
  : spawn('npx', ['electron-builder', '--win', 'portable', `--config.directories.output=${buildTempDir}`], { cwd: __dirname, env });

function formatProgressBar(str) {
  const match = str.match(/\[([=>\s]+)\]\s*(\d+)%\s*\|\s*(.*)/);
  if (match) {
    const percent = Math.min(100, Math.max(0, parseInt(match[2], 10)));
    const label = match[3].trim();
    const barWidth = 45;
    const greenWidth = Math.round((percent / 100) * barWidth);
    const redWidth = barWidth - greenWidth;

    const greenBar = greenColor + "█".repeat(greenWidth);
    const redBar = redColor + "▓".repeat(redWidth);

    return `\r    [${greenBar}${redBar}${reset}] ${boldWhite}${percent}%${reset} | ${cyanColor}${label}${reset}  `;
  }
  return null;
}

let buffer = '';
let spinnerTimer = null;
let secondsElapsed = 0;
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let frameIdx = 0;

function startSpinner() {
  if (spinnerTimer) return;
  spinnerTimer = setInterval(() => {
    secondsElapsed++;
    const frame = spinnerFrames[frameIdx++ % spinnerFrames.length];
    process.stdout.write(`\r  ${greenColor}${frame}${reset} ${yellowColor}กำลังบีบอัดและรวมไฟล์เป็น Portable .exe... (${secondsElapsed}s)${reset}  `);
  }, 1000);
}

function stopSpinner() {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    process.stdout.write('\r                                                                 \r');
  }
}

function handleData(chunk, isStderr = false) {
  const text = chunk.toString();
  buffer += text;

  const lines = buffer.split(/\r?\n|\r/);
  buffer = lines.pop();

  for (const line of lines) {
    const customBar = formatProgressBar(line);
    if (customBar) {
      process.stdout.write(customBar);
    } else {
      if (line.includes('• downloading')) {
        process.stdout.write(`\n  ${cyanColor}• downloading${reset} ${line.replace(/.*• downloading\s*/, '')}\n`);
      } else if (line.includes('• packaging')) {
        process.stdout.write(`\n  ${greenColor}• packaging${reset} ${line.replace(/.*• packaging\s*/, '')}\n`);
      } else if (line.includes('• building') && line.includes('target=portable')) {
        process.stdout.write(`\n  ${cyanColor}• building${reset} ${line.replace(/.*• building\s*/, '')}\n`);
        startSpinner();
      } else if (line.includes('• building')) {
        process.stdout.write(`\n  ${cyanColor}• building${reset} ${line.replace(/.*• building\s*/, '')}\n`);
      } else {
        if (!line.includes('no code signing certificate configured')) {
          if (isStderr) {
            process.stderr.write(line + '\n');
          } else {
            process.stdout.write(line + '\n');
          }
        }
      }
    }
  }
}

child.stdout.on('data', (d) => handleData(d, false));
child.stderr.on('data', (d) => handleData(d, true));

child.on('close', (code) => {
  stopSpinner();
  if (buffer.trim()) {
    const customBar = formatProgressBar(buffer);
    if (customBar) process.stdout.write(customBar + '\n');
    else if (!buffer.includes('no code signing')) process.stdout.write(buffer + '\n');
  }

  if (code === 0) {
    try {
      const srcExe = path.join(buildTempDir, 'AetherClean Pro 1.0.0.exe');
      const destExe = path.join(destDir, 'AetherClean Pro 1.0.0.exe');
      if (fs.existsSync(srcExe)) {
        fs.copyFileSync(srcExe, destExe);
        console.log(`\n${greenColor}[SUCCESS]${reset} บิลด์สำเร็จเรียบร้อย! Output อยู่ที่:\n  ${cyanColor}${destExe}${reset}`);
      }
    } catch (e) {
      console.warn('Note on copying artifact:', e.message);
    }
  }

  process.exit(code || 0);
});

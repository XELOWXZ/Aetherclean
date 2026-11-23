// build-runner.js - Cyberpunk Build Runner with Neon Green & Red Progress Bars
const { spawn } = require('child_process');
const path = require('path');

const greenColor = "\x1b[38;2;0;255;102m"; // Neon Cyber Green (หลอดสีเขียว)
const redColor = "\x1b[38;2;239;68;68m";   // Cyber Alert Red (หลอดสีแดง)
const cyanColor = "\x1b[38;2;0;240;255m";  // Cyber Cyan
const boldWhite = "\x1b[1;37m";
const reset = "\x1b[0m";

console.log(`${cyanColor}================================================================${reset}`);
console.log(`${greenColor}   AetherClean Pro - Cyberpunk Executable Builder (.exe)${reset}`);
console.log(`${cyanColor}================================================================${reset}`);
console.log(`${cyanColor}[1/2]${reset} Spawning Electron Builder with Cyber Colored Download Stream...\n`);

// Clean environment
const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

const child = spawn(npmCmd, ['run', 'build:portable'], {
  cwd: __dirname,
  env,
  shell: true
});

function formatProgressBar(str) {
  // Matches progress lines like:
  // [=========================>                 ] 55% | electron
  // or [========================================] 100% | electron
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

function handleData(chunk, isStderr = false) {
  const text = chunk.toString();
  buffer += text;

  const lines = buffer.split(/\r?\n|\r/);
  buffer = lines.pop(); // keep last incomplete line

  for (const line of lines) {
    const customBar = formatProgressBar(line);
    if (customBar) {
      process.stdout.write(customBar);
    } else {
      if (line.includes('• downloading')) {
        process.stdout.write(`\n  ${cyanColor}• downloading${reset} ${line.replace(/.*• downloading\s*/, '')}\n`);
      } else if (line.includes('• packaging')) {
        process.stdout.write(`\n  ${greenColor}• packaging${reset} ${line.replace(/.*• packaging\s*/, '')}\n`);
      } else if (line.includes('• building')) {
        process.stdout.write(`\n  ${cyanColor}• building${reset} ${line.replace(/.*• building\s*/, '')}\n`);
      } else {
        if (isStderr) {
          process.stderr.write(line + '\n');
        } else {
          process.stdout.write(line + '\n');
        }
      }
    }
  }
}

child.stdout.on('data', (d) => handleData(d, false));
child.stderr.on('data', (d) => handleData(d, true));

child.on('close', (code) => {
  if (buffer.trim()) {
    const customBar = formatProgressBar(buffer);
    if (customBar) process.stdout.write(customBar + '\n');
    else process.stdout.write(buffer + '\n');
  }
  process.exit(code || 0);
});

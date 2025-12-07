const { spawn } = require('child_process');
const path = require('path');

// In-memory map of running bot processes
const processes = new Map();

function startBot(botId, scriptPath) {
  if (processes.has(botId)) return { ok: false, msg: 'Already running' };
  const full = path.isAbsolute(scriptPath) ? scriptPath : path.join(__dirname, '..', scriptPath);
  const proc = spawn('node', [full], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  proc.stdout.on('data', (d) => console.log(`[bot ${botId}]`, d.toString().trim()));
  proc.stderr.on('data', (d) => console.error(`[bot ${botId}][ERR]`, d.toString().trim()));

  proc.on('exit', (code) => {
    console.log(`Bot ${botId} exited ${code}`);
    processes.delete(botId);
  });

  processes.set(botId, proc);
  return { ok: true };
}

function stopBot(botId) {
  const proc = processes.get(botId);
  if (!proc) return { ok: false, msg: 'Not running' };
  try {
    process.kill(-proc.pid);
  } catch (e) {
    console.error(e);
  }
  processes.delete(botId);
  return { ok: true };
}

function isRunning(botId) {
  return processes.has(botId);
}

module.exports = { startBot, stopBot, isRunning };

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = process.argv[2] ?? null;
const APP_PORT = 5311;
const DEBUG_PORT = 9234;
const PROFILE = path.join(ROOT, '.chrome-diag');

function killTree(pid) {
  spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
}

async function waitForHttp(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`timeout waiting for ${url}`);
}

function createCdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let nextId = 1;
  ws.addEventListener('message', (raw) => {
    const msg = JSON.parse(raw.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return {
    events,
    async send(method, params = {}) {
      await ready;
      const id = nextId++;
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      ws.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() {
      ws.close();
    }
  };
}

let vite = null;
let chrome = null;
let cdp = null;

try {
  if (!TARGET_URL) {
    vite = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(APP_PORT), '--strictPort'], {
      cwd: ROOT,
      stdio: 'ignore'
    });
    await waitForHttp(`http://localhost:${APP_PORT}/`, 30000);
  }
  const url = TARGET_URL ?? `http://localhost:${APP_PORT}/?seed=1337`;

  chrome = spawn(
    CHROME,
    ['--headless', '--no-sandbox', `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${DEBUG_PORT}`, '--window-size=1280,720', 'about:blank'],
    { stdio: 'ignore' }
  );
  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 30000);
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url });

  await sleep(8000);
  const hud = (await cdp.send('Runtime.evaluate', {
    expression: "document.getElementById('hud-stats')?.textContent ?? ''",
    returnByValue: true
  })).result.value;
  const gpu = (await cdp.send('Runtime.evaluate', {
    expression: 'JSON.stringify({ gpu: !!navigator.gpu, engine: !!window.__engine })',
    returnByValue: true
  })).result.value;
  const errors = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => `${e.params.exceptionDetails.text} ${e.params.exceptionDetails.exception?.description ?? ''}`);
  const warnings = cdp.events
    .filter((e) => e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type))
    .map((e) => `${e.params.type}: ${e.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);

  console.log(`no-WebGPU-flag headless check:`);
  console.log(`  gpu/engine: ${gpu}`);
  console.log(`  hud: ${JSON.stringify(hud)}`);
  console.log(`  exceptions: ${errors.length ? errors.join(' | ') : 'none'}`);
  console.log(`  console: ${warnings.length ? warnings.slice(0, 8).join(' | ') : 'none'}`);
} catch (err) {
  console.error(`DIAG FAIL: ${err.message}`);
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (chrome?.pid) killTree(chrome.pid);
  if (vite?.pid) killTree(vite.pid);
  await sleep(500);
}

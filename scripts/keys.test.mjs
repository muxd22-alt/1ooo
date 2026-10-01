import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_PORT = 5312;
const DEBUG_PORT = 9235;
const PROFILE = path.join(ROOT, '.chrome-keys');

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
  let nextId = 1;
  ws.addEventListener('message', (raw) => {
    const msg = JSON.parse(raw.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return {
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

async function evalJson(cdp, expression) {
  const out = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) throw new Error(out.exceptionDetails.text);
  return out.result.value;
}

let vite = null;
let chrome = null;
let cdp = null;

try {
  vite = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(APP_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore'
  });
  await waitForHttp(`http://localhost:${APP_PORT}/`, 30000);

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
  await cdp.send('Page.navigate', { url: `http://localhost:${APP_PORT}/` });

  const deadline = Date.now() + 60000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('engine not ready');
    const ready = await evalJson(cdp, "!!(window.__engine && /fps/.test(document.getElementById('hud-stats').textContent))");
    if (ready) break;
    await sleep(500);
  }

  const p0 = await evalJson(cdp, 'JSON.stringify(window.__engine.pos())');

  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await sleep(700);
  const keysHeld = await evalJson(cdp, 'JSON.stringify(window.__engine.keys())');
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
  await sleep(100);
  const p1 = await evalJson(cdp, 'JSON.stringify(window.__engine.pos())');

  const a = JSON.parse(p0);
  const b = JSON.parse(p1);
  const moved = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

  console.log(`keys while held: ${keysHeld}`);
  console.log(`pos before: ${p0}`);
  console.log(`pos after:  ${p1}`);
  console.log(`WASD movement: ${moved > 1 ? `moved ${moved.toFixed(1)}m — OK` : `only ${moved.toFixed(2)}m — BROKEN`}`);
  if (moved <= 1) process.exitCode = 1;
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (chrome?.pid) killTree(chrome.pid);
  if (vite?.pid) killTree(vite.pid);
  await sleep(500);
}

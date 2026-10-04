import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_PORT = 5314;
const DEBUG_PORT = 9237;
const PROFILE = path.join(ROOT, '.chrome-shot');
const OUT = path.join(ROOT, '.shots');
const R = 64;
const C = 96;
const DEG = Math.PI / 180;

const SHOTS = [
  { name: 'street-n', lat: 0.4, lon: 10, yaw: 0, pitch: -0.12, eye: 1.7 },
  { name: 'street-s', lat: 0.4, lon: 10, yaw: Math.PI, pitch: -0.12, eye: 1.7 },
  { name: 'street-n2', lat: 0.4, lon: 55, yaw: 0, pitch: -0.12, eye: 1.7 },
  { name: 'street-e', lat: 10, lon: 45.4, yaw: -Math.PI / 2, pitch: -0.12, eye: 1.7 },
  { name: 'street-w', lat: 10, lon: 45.4, yaw: Math.PI / 2, pitch: -0.12, eye: 1.7 },
  { name: 'avenue', lat: 0.4, lon: 12, yaw: 1.6, pitch: -0.08, eye: 1.7 },
  { name: 'rooftops', lat: 6, lon: 8, yaw: 0.6, pitch: -0.5, eye: 14 },
  { name: 'overview', lat: 8, lon: 8, yaw: 0.6, pitch: -0.65, eye: 34 },
  { name: 'skyline', lat: 6, lon: 6, yaw: 0.9, pitch: -0.3, eye: 52 }
];

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

function surface(latDeg, lonDeg, lift = 0.5) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const d = R + lift;
  return [
    Math.round((C + d * Math.cos(lat) * Math.cos(lon)) * 100) / 100,
    Math.round((C + d * Math.sin(lat)) * 100) / 100,
    Math.round((C + d * Math.cos(lat) * Math.sin(lon)) * 100) / 100
  ];
}

let vite = null;
let chrome = null;
let cdp = null;

try {
  mkdirSync(OUT, { recursive: true });
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
  await cdp.send('Page.navigate', { url: `http://localhost:${APP_PORT}/?phase=0.25` });

  const deadline = Date.now() + 60000;
  for (;;) {
    if (Date.now() > deadline) throw new Error('engine not ready');
    const ready = await evalJson(
      cdp,
      "!!(window.__engine && /fps/.test(document.getElementById('hud-stats').textContent) && /quads/.test(document.getElementById('hud-stats').textContent))"
    );
    if (ready) break;
    await sleep(500);
  }
  await sleep(2500);

  for (const shot of SHOTS) {
    const feet = surface(shot.lat, shot.lon, Math.max(0.1, (shot.eye ?? 1.7) - 1.6));
    const cam = await evalJson(cdp, `JSON.stringify(window.__engine.view(${JSON.stringify(feet)}, ${shot.yaw}, ${shot.pitch}))`);
    await sleep(700);
    const png = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, `${shot.name}.png`);
    writeFileSync(file, Buffer.from(png.data, 'base64'));
    console.log(`${shot.name}: cam ${cam} -> ${file}`);
  }
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (chrome?.pid) killTree(chrome.pid);
  if (vite?.pid) killTree(vite.pid);
  await sleep(500);
}

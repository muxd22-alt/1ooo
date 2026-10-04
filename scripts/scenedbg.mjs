import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_PORT = 5315;
const DEBUG_PORT = 9238;
const PROFILE = path.join(ROOT, '.chrome-shot');

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
  if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails));
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

  const trafficDeadline = Date.now() + 20000;
  let traffic = null;
  while (Date.now() < trafficDeadline) {
    traffic = await evalJson(cdp, 'JSON.parse(JSON.stringify(window.__engine.traffic()))');
    if (traffic.count >= 4) break;
    await sleep(500);
  }
  const stats = await evalJson(cdp, 'JSON.parse(JSON.stringify(window.__engine.sceneStats()))');
  const pos = await evalJson(cdp, 'JSON.stringify(window.__engine.pos())');
  const v1 = await evalJson(cdp, 'JSON.stringify({p: window.__engine.view([161,112,96], 0, -1.35), f: window.__engine.camFwd(), pitch: window.__engine.pitch()})');
  await sleep(100);
  const v2 = await evalJson(cdp, 'JSON.stringify({p: window.__engine.pos(), f: window.__engine.camFwd(), pitch: window.__engine.pitch()})');
  await sleep(1000);
  const v3 = await evalJson(cdp, 'JSON.stringify({p: window.__engine.pos(), f: window.__engine.camFwd(), pitch: window.__engine.pitch()})');
  const viewShot = await evalJson(cdp, 'JSON.stringify(window.__engine.view([143.5,118.42,55.01], 0, -1.5))');
  await sleep(700);
  const atCapture = await evalJson(cdp, 'JSON.stringify({p: window.__engine.pos(), f: window.__engine.camFwd(), pitch: window.__engine.pitch()})');
  const png = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(path.join(ROOT, '.shots'), { recursive: true });
  writeFileSync(path.join(ROOT, '.shots', 'dbg-cardirect.png'), Buffer.from(png.data, 'base64'));
  const logs = await evalJson(
    cdp,
    "JSON.stringify(performance.getEntriesByType('resource').filter(e=>/glb|manifest|colormap/.test(e.name)).map(e=>({n:e.name.split('/').slice(-2).join('/'),s:e.transferSize,d:Math.round(e.duration)})))"
  );
  console.log('traffic:', JSON.stringify(traffic, null, 1));
  console.log('scene:', JSON.stringify(stats));
  console.log('camera:', pos);
  console.log('view+0ms :', v1);
  console.log('view+100ms:', v2);
  console.log('view+1s   :', v3);
  console.log('car view:', viewShot);
  console.log('at capture:', atCapture);
  console.log('resources:', logs);
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (chrome?.pid) killTree(chrome.pid);
  if (vite?.pid) killTree(vite.pid);
  await sleep(500);
}

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_PORT = 5316;
const DEBUG_PORT = 9239;
const PROFILE = path.join(ROOT, '.chrome-probe');
const DEG = Math.PI / 180;
const R = 64;
const C = 96;

const IDS = {
  0: 'AIR',
  1: 'GRASS',
  2: 'DIRT',
  3: 'STONE',
  4: 'SAND',
  5: 'ROAD',
  6: 'LINE',
  7: 'WALK',
  8: 'BRICK',
  9: 'CONCRETE',
  13: 'LAMP',
  19: 'FENCE',
  20: 'LEAVES',
  21: 'TRUNK',
  22: 'WATER',
  23: 'PLAZA',
  24: 'LOT'
};

function idName(id) {
  if (id === -1) return 'EDGE';
  if (id >= 32) return 'PREFAB';
  if (id >= 25 && id <= 27) return 'NEON';
  return IDS[id] || `#${id}`;
}

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
  const listeners = new Map();
  let nextId = 1;
  ws.addEventListener('message', (raw) => {
    const msg = JSON.parse(raw.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
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

function fmt(h) {
  if (!h) return 'MISS';
  return `r=${h.r.toFixed(3)} id=${idName(h.id)} d=${h.dist.toFixed(1)}`;
}

const VIEWS = [
  { name: 'street-n', lat: 0.4, lon: 10, yaw: 0, pitch: -0.12, eye: 1.7 },
  { name: 'street-s', lat: 0.4, lon: 10, yaw: Math.PI, pitch: -0.12, eye: 1.7 },
  { name: 'street-e', lat: 10, lon: 45.4, yaw: -Math.PI / 2, pitch: -0.12, eye: 1.7 },
  { name: 'street-w', lat: 10, lon: 45.4, yaw: Math.PI / 2, pitch: -0.12, eye: 1.7 },
  { name: 'avenue', lat: 0.4, lon: 12, yaw: 1.6, pitch: -0.22, eye: 1.7 }
];

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
    ['--headless', '--no-sandbox', `--user-data-dir=${PROFILE}`, '--remote-debugging-port=' + DEBUG_PORT, '--window-size=1280,720', 'about:blank'],
    { stdio: 'ignore' }
  );
  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 30000);
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  cdp.on('Runtime.exceptionThrown', (e) => {
    const d = e.exceptionDetails || {};
    console.log(`EXC: ${(d.exception?.description || d.text || '').slice(0, 260)}`);
  });
  cdp.on('Runtime.consoleAPICalled', (e) => {
    if (e.type === 'error' || e.type === 'warning') {
      console.log(`CON: ${e.args.map((a) => a.value ?? '').join(' ').slice(0, 260)}`);
    }
  });
  await cdp.send('Page.navigate', { url: `http://localhost:${APP_PORT}/?phase=0.25&seed=${process.env.SEED || '1337'}` });

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
  const cityDeadline = Date.now() + 30000;
  let city = null;
  while (Date.now() < cityDeadline) {
    city = await evalJson(cdp, 'JSON.stringify(window.__engine.city())').catch(() => null);
    if (city) {
      city = JSON.parse(city);
      break;
    }
    await sleep(500);
  }
  console.log('city:', JSON.stringify(city));
  await sleep(1000);

  console.log('--- road line lat=0 (east-west road) ---');
  for (let lon = -160; lon <= 160; lon += 20) {
    const h = await evalJson(cdp, `JSON.stringify(window.__engine.probeGround(0, ${lon}))`);
    console.log(`lon=${String(lon).padStart(4)} ${fmt(JSON.parse(h))}`);
  }

  console.log('--- cross lon=10 (street-n/s road), lat -9..9 ---');
  for (let lat = -9; lat <= 9.0001; lat += 0.5) {
    const h = await evalJson(cdp, `JSON.stringify(window.__engine.probeGround(${lat.toFixed(2)}, 10))`);
    console.log(`lat=${lat.toFixed(1).padStart(5)} ${fmt(JSON.parse(h))}`);
  }

  console.log('--- fine curb profile lon=10, lat 4.0..10.0 step 0.1 ---');
  for (let lat = 4; lat <= 10.0001; lat += 0.1) {
    const h = await evalJson(cdp, `JSON.stringify(window.__engine.probeGround(${lat.toFixed(2)}, 10))`);
    console.log(`lat=${lat.toFixed(1).padStart(5)} ${fmt(JSON.parse(h))}`);
  }

  console.log('--- cross lat=10 (street-e/w road), lon 36..54 ---');
  for (let lon = 36; lon <= 54.0001; lon += 0.5) {
    const h = await evalJson(cdp, `JSON.stringify(window.__engine.probeGround(10, ${lon.toFixed(2)}))`);
    console.log(`lon=${lon.toFixed(1).padStart(5)} ${fmt(JSON.parse(h))}`);
  }

  console.log('--- camera forward rays ---');
  for (const v of VIEWS) {
    const feet = surface(v.lat, v.lon, Math.max(0.1, (v.eye ?? 1.7) - 1.6));
    await evalJson(cdp, `window.__engine.view(${JSON.stringify(feet)}, ${v.yaw}, ${v.pitch}), 'ok'`);
    await sleep(150);
    const hit = await evalJson(
      cdp,
      'JSON.stringify((() => { const p = window.__engine.pos(); const f = window.__engine.camFwd(); return window.__engine.probeRay(p, f, 60); })())'
    );
    console.log(`${v.name.padEnd(9)} ${fmt(JSON.parse(hit))}`);
  }

  console.log('--- street-n pitch scan ---');
  {
    const v = VIEWS[0];
    const feet = surface(v.lat, v.lon, Math.max(0.1, (v.eye ?? 1.7) - 1.6));
    for (const p of [-0.12, -0.25, -0.4, -0.55, -0.7]) {
      await evalJson(cdp, `window.__engine.view(${JSON.stringify(feet)}, ${v.yaw}, ${p}), 'ok'`);
      await sleep(120);
      const hit = await evalJson(
        cdp,
        'JSON.stringify((() => { const p = window.__engine.pos(); const f = window.__engine.camFwd(); return window.__engine.probeRay(p, f, 60); })())'
      );
      console.log(`pitch=${p.toFixed(2)} ${fmt(JSON.parse(hit))}`);
    }
  }

  console.log('--- voxel id sweep around cameras (0,2,4,6,8,10m) ---');
  const SWEEP = [
    { name: 'street-n/s', lat: 0.4, lon: 10 },
    { name: 'avenue', lat: 0.4, lon: 12 },
    { name: 'street-e/w', lat: 10, lon: 45.4 },
    { name: 'signals', lat: -2.6, lon: 6.355 }
  ];
  for (const s of SWEEP) {
    const latStep = ((1 / 64) * 180) / Math.PI;
    const lonStep = ((1 / (64 * Math.cos(s.lat * DEG))) * 180) / Math.PI;
    for (const dir of ['+lat', '-lat', '+lon', '-lon']) {
      const ids = [];
      for (const d of [0, 2, 4, 6, 8, 10]) {
        let lat = s.lat;
        let lon = s.lon;
        if (dir === '+lat') lat += d * latStep;
        if (dir === '-lat') lat -= d * latStep;
        if (dir === '+lon') lon += d * lonStep;
        if (dir === '-lon') lon -= d * lonStep;
        const v = await evalJson(cdp, `JSON.stringify(window.__engine.probeVoxel(${lat.toFixed(4)}, ${lon.toFixed(4)}))`);
        const p = JSON.parse(v);
        ids.push(p ? `${idName(p.id)}@${p.r}` : 'MISS');
      }
      console.log(`${s.name.padEnd(10)} ${dir.padStart(5)}  ${ids.join(' ')}`);
    }
  }
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (chrome?.pid) killTree(chrome.pid);
  if (vite?.pid) killTree(vite.pid);
  await sleep(500);
}

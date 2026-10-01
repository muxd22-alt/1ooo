import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP_PORT = 5310;
const DEBUG_PORT = 9233;
const PROFILE = path.join(ROOT, '.chrome-smoke');
const TIMEOUT_MS = 90000;

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
  vite = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(APP_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: false
  });

  await waitForHttp(`http://localhost:${APP_PORT}/`, 30000);

  chrome = spawn(
    CHROME,
    [
      '--headless',
      '--no-sandbox',
      `--user-data-dir=${PROFILE}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--enable-unsafe-webgpu',
      '--window-size=1280,720',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 30000);
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');

  cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `http://localhost:${APP_PORT}/?seed=1337` });

  const deadline = Date.now() + TIMEOUT_MS;
  let hud = '';
  let fatal = null;

  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const out = await cdp.send('Runtime.evaluate', {
        expression: "document.getElementById('hud-stats')?.textContent ?? ''",
        returnByValue: true
      });
      hud = out.result.value ?? '';
    } catch {
      continue;
    }
    if (/failed|worker error/i.test(hud)) {
      fatal = hud;
      break;
    }
    if (/fps/.test(hud) && /quads/.test(hud)) break;
  }

  const consoleErrors = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || e.method === 'Runtime.consoleAPICalled')
    .filter((e) =>
      e.method === 'Runtime.consoleAPICalled'
        ? ['error', 'warning'].includes(e.params.type)
        : true
    )
    .map((e) =>
      e.method === 'Runtime.exceptionThrown'
        ? `exception: ${e.params.exceptionDetails.text} ${e.params.exceptionDetails.exception?.description ?? ''}`
        : `${e.params.type}: ${e.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`
    );

  if (fatal) throw new Error(`engine reported: ${fatal}`);
  if (!/fps/.test(hud) || !/quads/.test(hud)) {
    throw new Error(`engine did not reach ready state; hud was: ${JSON.stringify(hud)}\nconsole: ${consoleErrors.join('\n')}`);
  }

  const fireDeadline = Date.now() + 20000;
  let fireStats = null;
  while (Date.now() < fireDeadline) {
    const shot = await cdp.send('Runtime.evaluate', {
      expression: 'window.__engine?.shoot(); true',
      returnByValue: true
    });
    if (shot.exceptionDetails) throw new Error(`shoot() threw: ${shot.exceptionDetails.text}`);

    const statsOut = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__engine?.stats() ?? null)',
      returnByValue: true
    });
    fireStats = JSON.parse(statsOut.result.value);
    if (fireStats && fireStats.hits >= 1 && fireStats.voxelsRemoved > 0) break;
    await sleep(500);
  }

  if (!fireStats || fireStats.hits < 1 || fireStats.voxelsRemoved <= 0) {
    throw new Error(`destruction pipeline did not confirm a hit; stats: ${JSON.stringify(fireStats)}`);
  }

  const hudAfter = (
    await cdp.send('Runtime.evaluate', {
      expression: "document.getElementById('hud-stats')?.textContent ?? ''",
      returnByValue: true
    })
  ).result.value;

  console.log('OK  smoke test passed');
  console.log(
    hudAfter
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')
  );
  console.log(`    destruction pipeline: ${JSON.stringify(fireStats)}`);
  if (consoleErrors.length) {
    console.log('    console warnings/errors:');
    for (const line of consoleErrors) console.log(`      ${line}`);
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

import { spawn } from 'node:child_process';
import { readFileSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/usr/bin/google-chrome');
const APP_PORT = 5310;
const DEBUG_PORT = 9233;
const PROFILE = path.join(ROOT, '.chrome-smoke');
const TIMEOUT_MS = 150000;
const GITHUB_ACTIONS = !!process.env.GITHUB_ACTIONS;
const milestones = [];
const startedAt = Date.now();

function mark(label) {
  milestones.push(`+${((Date.now() - startedAt) / 1000).toFixed(1)}s ${label}`);
  console.log(`    ... ${milestones[milestones.length - 1]}`);
}

function ghError(message) {
  if (!GITHUB_ACTIONS) return;
  const text = String(message).replace(/\r?\n/g, '%0A');
  console.log(`::error title=Headless Chrome smoke failed::${text}`);
}

function killTree(pid) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }
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
const chromeLogPath = path.join(ROOT, '.chrome-smoke.log');
const chromeLogFd = chromeLogPath ? openSync(chromeLogPath, 'w') : null;

function collectConsole() {
  if (!cdp) return [];
  return cdp.events
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
}

function collectNavigations() {
  if (!cdp) return [];
  return cdp.events
    .filter((e) => e.method === 'Page.frameNavigated')
    .map((e) => `navigated: ${e.params.frame.url}`)
    .slice(-10);
}

try {
  vite = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(APP_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: process.platform !== 'win32'
  });

  await waitForHttp(`http://localhost:${APP_PORT}/`, 30000);
  mark(`vite ready on :${APP_PORT}`);

  chrome = spawn(
    CHROME,
    [
      '--headless',
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      `--user-data-dir=${PROFILE}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--enable-unsafe-webgpu',
      '--window-size=1280,720',
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', chromeLogFd], detached: process.platform !== 'win32' }
  );

  await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/list`, 30000);
  mark('chrome cdp endpoint ready');
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');

  cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `http://localhost:${APP_PORT}/?seed=1337` });
  mark('page navigated to app');

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

  const consoleErrors = collectConsole();

  if (fatal) throw new Error(`engine reported: ${fatal}`);
  if (!/fps/.test(hud) || !/quads/.test(hud)) {
    throw new Error(`engine did not reach ready state; hud was: ${JSON.stringify(hud)}\nconsole: ${consoleErrors.join('\n')}`);
  }
  mark('engine ready (fps+quads in hud)');

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
  mark(`destruction confirmed ${JSON.stringify(fireStats)}`);

  const layaDeadline = Date.now() + 90000;
  let layaState = null;
  while (Date.now() < layaDeadline) {
    const out = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__engine?.laya?.() ?? null)',
      returnByValue: true
    });
    layaState = JSON.parse(out.result.value);
    if (layaState?.ready && layaState.inferCount >= 1) break;
    await sleep(500);
  }

  if (!layaState) throw new Error('laya state unavailable');
  if (layaState.error) throw new Error(`laya reported: ${layaState.error}`);
  if (!layaState.ready || layaState.inferCount < 1) {
    throw new Error(`laya pipeline not ready: ${JSON.stringify(layaState)}`);
  }
  if (!Array.isArray(layaState.logits) || layaState.logits.length !== 3 || !layaState.logits.every(Number.isFinite)) {
    throw new Error(`invalid live logits: ${JSON.stringify(layaState.logits)}`);
  }
  if (!(layaState.latencyMs > 0)) {
    throw new Error(`invalid inference latency: ${layaState.latencyMs}`);
  }
  mark(`laya live state ready ${JSON.stringify(layaState.logits)}`);

  const reference = JSON.parse(readFileSync(new URL('../data/laya-reference.json', import.meta.url), 'utf8'));
  const verifiedIntents = [];
  for (const sample of reference.samples) {
    const expr = `window.__engine.inferSample(${JSON.stringify(sample.features)}).then((r) => JSON.stringify(r))`;
    const res = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(
        `inferSample failed: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description ?? ''}`
      );
    }
    const payload = JSON.parse(res.result.value);
    for (let i = 0; i < sample.logits.length; i++) {
      const delta = Math.abs(payload.logits[i] - sample.logits[i]);
      if (delta > reference.tolerance) {
        throw new Error(
          `logit mismatch ${JSON.stringify(sample.features)}[${i}]: browser ${payload.logits[i]} vs reference ${sample.logits[i]} (delta ${delta.toFixed(4)} > ${reference.tolerance})`
        );
      }
    }
    const argmax = payload.logits.indexOf(Math.max(...payload.logits));
    if (reference.intents[argmax] !== sample.intent) {
      throw new Error(`intent mismatch: browser ${reference.intents[argmax]} vs reference ${sample.intent}`);
    }
    verifiedIntents.push(sample.intent);
  }
  mark(`INT8 reference verified (${verifiedIntents.join('/')})`);

  const hudDeadline = Date.now() + 45000;
  let hudAfter = '';
  while (Date.now() < hudDeadline) {
    hudAfter = (
      await cdp.send('Runtime.evaluate', {
        expression: "document.getElementById('hud-stats')?.textContent ?? ''",
        returnByValue: true
      })
    ).result.value;
    if (/laya ready/.test(hudAfter)) break;
    await sleep(300);
  }
  if (!/laya ready/.test(hudAfter)) {
    throw new Error(`HUD never showed ready laya line: ${JSON.stringify(hudAfter)}`);
  }
  mark('hud shows laya ready');

  console.log('OK  smoke test passed');
  console.log(
    hudAfter
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')
  );
  console.log(`    destruction pipeline: ${JSON.stringify(fireStats)}`);
  console.log(
    `    laya pipeline: ${layaState.inferCount} live inferences @ ${layaState.latencyMs.toFixed(2)}ms · ` +
      `intent ${layaState.intent} · verified ${verifiedIntents.join('/')} vs INT8 reference`
  );
  if (consoleErrors.length) {
    console.log('    console warnings/errors:');
    for (const line of consoleErrors) console.log(`      ${line}`);
  }
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  const navs = collectNavigations();
  if (navs.length) console.error('    page navigations:\n' + navs.map((n) => `      ${n}`).join('\n'));
  const errs = collectConsole();
  if (errs.length) console.error('    console:\n' + errs.map((e) => `      ${e}`).join('\n'));

  let chromeTail = '';
  try {
    const log = readFileSync(chromeLogPath, 'utf8').trim();
    chromeTail = log ? `\nchrome stderr (tail):\n${log.split('\n').slice(-30).join('\n')}` : '';
  } catch {}

  ghError(
    `${err.message}\n` +
      `milestones:\n${milestones.map((m) => `  ${m}`).join('\n')}\n` +
      (navs.length ? `navigations:\n${navs.join('\n')}\n` : '') +
      (errs.length ? `console:\n${errs.join('\n')}` : '') +
      chromeTail
  );
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (chrome?.pid) killTree(chrome.pid);
  if (vite?.pid) killTree(vite.pid);
  if (chromeLogFd !== null) closeSync(chromeLogFd);
  await sleep(500);
}

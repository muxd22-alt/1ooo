import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(ROOT, '.assets-src');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const ASSETS = [
  { name: 'car-kit', page: 'https://opengameart.org/content/car-kit' },
  { name: 'city-kit-commercial', page: 'https://opengameart.org/content/city-kit-commercial' },
  { name: 'nature-kit', page: 'https://opengameart.org/content/nature-kit' },
  { name: 'city-kit-roads', page: 'https://opengameart.org/content/city-kit-roads' },
  { name: 'blaster-kit', url: 'https://kenney.nl/media/pages/assets/blaster-kit/261d80a716-1753959510/kenney_blaster-kit_2.1.zip' },
  { name: 'particle-pack', url: 'https://kenney.nl/media/pages/assets/particle-pack/f8fe0f8cb8-1677578741/kenney_particle-pack.zip' }
];

async function get(url, asBuffer = false) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.text();
}

async function zipUrl(asset) {
  if (asset.url) return asset.url;
  const html = await get(asset.page);
  const m = html.match(/href="(https:\/\/opengameart\.org\/sites\/default\/files\/[^"]+\.zip)"/);
  if (!m) throw new Error(`no zip link on ${asset.page}`);
  return m[1].replace(/&amp;/g, '&');
}

function unzip(buf, outDir) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('EOCD not found');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  let files = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central dir');
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const fnLen = buf.readUInt16LE(off + 28);
    const exLen = buf.readUInt16LE(off + 30);
    const cmLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + fnLen);
    const lhoFnLen = buf.readUInt16LE(lho + 26);
    const lhoExLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lhoFnLen + lhoExLen;
    const target = join(outDir, name.replace(/\\/g, '/'));
    if (name.endsWith('/')) {
      mkdirSync(target, { recursive: true });
    } else {
      mkdirSync(dirname(target), { recursive: true });
      const raw = buf.subarray(dataStart, dataStart + csize);
      const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
      if (!data) throw new Error(`unsupported method ${method} for ${name}`);
      writeFileSync(target, data);
      files++;
    }
    off += 46 + fnLen + exLen + cmLen;
  }
  return files;
}

mkdirSync(DEST, { recursive: true });
for (const asset of ASSETS) {
  const marker = join(DEST, asset.name, '.done');
  if (existsSync(marker)) { console.log(`${asset.name}: already extracted`); continue; }
  const url = await zipUrl(asset);
  const zipPath = join(DEST, `${asset.name}.zip`);
  if (!existsSync(zipPath)) {
    console.log(`${asset.name}: downloading ${url}`);
    const buf = await get(url, true);
    writeFileSync(zipPath, buf);
    console.log(`${asset.name}: ${(buf.length / 1e6).toFixed(1)} MB`);
  } else {
    console.log(`${asset.name}: zip present`);
  }
  const files = unzip(readFileSync(zipPath), join(DEST, asset.name));
  writeFileSync(marker, String(files));
  console.log(`${asset.name}: extracted ${files} files`);
}
console.log('fetch-assets: done');

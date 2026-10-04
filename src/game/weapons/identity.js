const SERIES = Object.freeze(['VK', 'VX', 'KR', 'HN', 'AX', 'QB']);
const MODELS = Object.freeze([
  'Kestrel',
  'Vandal',
  'Harrier',
  'Falcon',
  'Mirage',
  'Nomad',
  'Vector',
  'Cipher',
  'Ranger',
  'Bastion',
  'Sable',
  'Zephyr'
]);

export function mulberry32(a) {
  let s = a >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function weaponIdentity(seed, index) {
  const rng = mulberry32((seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0);
  const series = SERIES[Math.floor(rng() * SERIES.length)];
  const number = 10 + Math.floor(rng() * 90);
  const model = MODELS[Math.floor(rng() * MODELS.length)];
  return `${series}-${number} ${model}`;
}

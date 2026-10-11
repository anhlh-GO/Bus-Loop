// Picks each level's seed and difficulty knob (the road starts at 5 slots, + is free up to 7,
// and the bot taps + when the road is full, as a player would). The bot plays RUNS games per
// candidate; the knob walks from 1 towards the level's win-rate band (up: a more scrambled
// late lot and flatter colour mix above the screen; down: the reverse), trying SEEDS_TRIED
// seeds per knob, and the first candidate inside the band is kept (else the closest).
// Bands follow the hybrid-casual saw-tooth: easy ≥ 85 % of bot wins, normal 55–85 %,
// hard 30–55 %, super 12–35 %.
// Run: node scripts/tune.ts   (--write updates src/levels.ts, --only=12 tunes one level,
// --range=a-b tunes a slice; parallel runs merge with --merge=file1,file2…)
import { KNOBS, LEVEL_COUNT, SEEDS, botRun, generate, mulberry32, paramsOf } from '../src/levels.ts';

const RUNS = 12;
const SEEDS_TRIED = Number(process.argv.find((a) => a.startsWith('--seeds='))?.slice(8) ?? 4);
const BAND = { easy: [0.85, 1.01], normal: [0.55, 0.85], hard: [0.3, 0.55], super: [0.12, 0.35] } as const;
const UP = [1, 1.6, 2.5, 4, 6];
const DOWN = [1, 0.6, 0.35, 0.15];
const only = Number(process.argv.find((a) => a.startsWith('--only='))?.slice(7) ?? 0);
const range = (process.argv.find((a) => a.startsWith('--range='))?.slice(8) ?? '').split('-').map(Number);
const seeds: number[] = [...SEEDS];
const knobs: number[] = [...KNOBS];
type Best = { seed: number; knob: number; rate: number; buses: number; units: number };

function search(i: number, knob: number, lo: number, hi: number, mid: number): { best: Best; hit: boolean; mean: number } {
  const p = paramsOf(i);
  p.late *= knob;
  p.mix = Math.pow(p.mix, knob);
  let best: Best = { seed: 1, knob, rate: -1, buses: 0, units: 0 };
  let sum = 0, tried = 0;
  for (let s = i * 1000 + 1; s <= i * 1000 + SEEDS_TRIED; s++) {
    const spec = generate(i, s, p);
    if (!spec) continue;
    let wins = 0;
    for (let k = 0; k < RUNS; k++) if (botRun(spec, mulberry32(s * 977 + k))) wins++;
    const rate = wins / RUNS;
    sum += rate; tried++;
    const cur = { seed: s, knob, rate, buses: spec.buses.length, units: spec.buses.reduce((a, b) => a + b.cap, 0) };
    if (best.rate < 0 || Math.abs(rate - mid) < Math.abs(best.rate - mid)) best = cur;
    if (rate >= lo && rate < hi) return { best: cur, hit: true, mean: rate };
  }
  return { best, hit: false, mean: tried ? sum / tried : 0 };
}

for (let i = 0; i < LEVEL_COUNT; i++) {
  if (only && i !== only - 1) continue;
  if (range.length === 2 && (i + 1 < range[0] || i + 1 > range[1])) continue;
  const p = paramsOf(i);
  const [lo, hi] = BAND[p.difficulty];
  const mid = (lo + Math.min(1, hi)) / 2;
  let r = search(i, 1, lo, hi, mid);
  let overall = r.best;
  if (!r.hit) {
    // walk the knob the way the win rate has to go
    const steps = r.mean >= hi ? UP.slice(1) : DOWN.slice(1);
    for (const k of steps) {
      r = search(i, k, lo, hi, mid);
      if (r.hit || Math.abs(r.best.rate - mid) < Math.abs(overall.rate - mid)) overall = r.best;
      if (r.hit) break;
    }
  }
  seeds[i] = overall.seed;
  knobs[i] = overall.knob;
  const ok = overall.rate >= lo && overall.rate < hi ? '' : '  <-- outside band';
  console.log(`L${i + 1} ${p.difficulty.padEnd(6)} seed=${overall.seed} knob=${overall.knob} bot=${(overall.rate * 100).toFixed(0)}% buses=${overall.buses} balls=${overall.units}${ok}`);
}
const merge = process.argv.find((a) => a.startsWith('--merge='))?.slice(8);
if (merge) {
  const fs = await import('node:fs');
  for (const f of merge.split(',')) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/^L(\d+) \S+\s+seed=(\d+) knob=([\d.]+)/gm)) {
      seeds[+m[1] - 1] = +m[2];
      knobs[+m[1] - 1] = +m[3];
    }
  }
}
if (process.argv.includes('--write')) {
  const fs = await import('node:fs');
  const path = new URL('../src/levels.ts', import.meta.url);
  const src = fs.readFileSync(path, 'utf8')
    .replace(/export const SEEDS: number\[\] = \[[^\]]*\];/, `export const SEEDS: number[] = [${seeds.join(', ')}];`)
    .replace(/export const KNOBS: number\[\] = \[[^\]]*\];/, `export const KNOBS: number[] = [${knobs.join(', ')}];`);
  fs.writeFileSync(path, src);
  console.log('wrote SEEDS + KNOBS');
}

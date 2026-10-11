// Tiny synthesized sound kit — no audio files, so the single-file build stays small.

type Key = 'sound' | 'music' | 'haptic';

const flags: Record<Key, boolean> = { sound: true, music: true, haptic: true };
try {
  const saved = JSON.parse(localStorage.getItem('busflow_audio') ?? 'null');
  if (saved) Object.assign(flags, saved);
} catch { /* storage blocked: keep defaults */ }

let ctx: AudioContext | null = null;

/** Call from a user gesture: browsers only start audio after one. */
export function unlockAudio(): void {
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return; }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 0): void {
  if (!flags.sound || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  /** A bus pulls out of the lot. */
  drive(): void { tone(180, 0.22, 'sawtooth', 0.04, 0, 1.8); tone(520, 0.06, 'triangle', 0.06); },
  /** A ball pops into a bus; the pitch climbs with the combo. */
  take(k: number): void { tone(620 * Math.pow(1.045, Math.min(k, 14)), 0.05, 'sine', 0.06); },
  /** Ice cracks. */
  crack(): void { tone(1800, 0.05, 'square', 0.03, 0, 0.5); tone(1200, 0.06, 'triangle', 0.04, 0.03); },
  /** A crate breaks. */
  crate(): void { tone(160, 0.12, 'square', 0.06, 0, 0.6); tone(90, 0.15, 'triangle', 0.08, 0.02); },
  /** Three buses merge into a double-decker. */
  merge(): void { [392, 523, 659, 880].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, i * 0.06)); },
  /** An empty bus leaves happy. */
  depart(): void { [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, i * 0.05)); tone(200, 0.3, 'sawtooth', 0.03, 0.05, 2); },
  /** A blocked tap: short honk. */
  honk(): void { tone(392, 0.09, 'square', 0.05); tone(392, 0.12, 'square', 0.05, 0.13); },
  bump(): void { tone(140, 0.09, 'square', 0.05, 0, 0.7); },
  reveal(): void { tone(880, 0.08, 'triangle', 0.07); tone(1175, 0.1, 'triangle', 0.06, 0.07); },
  win(): void { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, 'triangle', 0.16, i * 0.09)); },
  lose(): void { [440, 370, 311, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.06, i * 0.14)); },
  booster(): void { tone(300, 0.4, 'sine', 0.15, 0, 3); tone(900, 0.25, 'triangle', 0.08, 0.1); },
  sweep(): void { tone(2400, 0.35, 'sawtooth', 0.025, 0, 0.2); tone(500, 0.3, 'sine', 0.08, 0.05, 2); },
  warn(): void { tone(660, 0.08, 'square', 0.05); tone(660, 0.08, 'square', 0.05, 0.12); },
  click(): void { tone(900, 0.04, 'triangle', 0.06); },
};

export function haptic(ms: number): void {
  if (flags.haptic && 'vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch { /* not allowed */ }
  }
}

export const audio = {
  set(key: Key, on: boolean): void {
    flags[key] = on;
    try { localStorage.setItem('busflow_audio', JSON.stringify(flags)); } catch { /* ignore */ }
  },
  get(key: Key): boolean { return flags[key]; },
};

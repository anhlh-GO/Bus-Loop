// 50 levels, each built from its picture (pictures.ts) and a seed.
//
// Buses: every colour's units (balls + ice layers) are split into buses. The
// order the buses are needed comes from an "oracle" run (every stop takes
// whatever it sees); the parking lot is dealt front row first from that order,
// shuffled by a window that grows with difficulty. The bot plays each candidate
// seed many times and scripts/tune.ts keeps a seed whose win rate fits the
// level's band — the saw-tooth curve of a hybrid-casual puzzle.

import { PICTURES } from './pictures.ts';
import { COLOR_KEYS, ROW, SHIFT, Sim, buildPath, geometry, ROAD_CLEAR, roadDist, type BusSpec, type Layout, type LevelSpec } from './sim.ts';

export const LEVEL_COUNT = 50;

/** Chosen by `node scripts/tune.ts --write`: the seed and the road's slot count per level. */
export const SEEDS: number[] = [1, 1001, 2003, 3001, 4002, 5001, 6001, 7001, 8002, 9003, 10001, 11001, 12003, 13001, 14001, 15001, 16001, 17003, 18001, 19003, 20001, 21003, 22004, 23001, 24003, 25001, 26002, 27002, 28004, 29003, 30001, 31001, 32001, 33001, 34004, 35001, 36003, 37002, 38001, 39004, 40003, 41001, 42001, 43002, 44003, 45001, 46003, 47004, 48001, 49002];
export const SLOTS: number[] = [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6];
/** Chosen by tune.ts: each level's difficulty knob (scales how scrambled the late part of the lot is). */
export const KNOBS: number[] = [1, 1, 1, 1, 1, 1, 1, 1, 6, 1, 1, 2.5, 0.6, 1, 2.5, 1, 1, 1, 1, 4, 1, 1, 1.6, 1, 1.6, 1, 1.6, 1, 1, 1.6, 1, 1.6, 4, 1, 1, 1, 0.35, 6, 0.15, 1, 1, 1, 6, 1, 0.35, 1, 0.6, 4, 1, 4];
/** Buses allowed on the road: 6 to start, + adds one for free, up to this. */
export const MAX_SLOTS = 8;

export type Difficulty = LevelSpec['difficulty'];

export interface Params {
  difficulty: Difficulty;
  cols: number;
  slots: number;
  /** Share of 200-loads among the 100s and 200s. */
  big: number;
  window: number;
  /** The lot's late part (buses needed after SMOOTH of the picture): how scrambled it is. */
  late: number;
  /** Colour mix of the hidden rows above the screen: 1 = the picture's own shares, lower = flatter (more of the rare "key" colours). */
  mix: number;
  /** Padlocked buses (Lock & Key). */
  locks: number;
  hidden: number;
  ice: number;
  /** Tunnels over the road (no pickups under them). */
  tunnels: number;
  /** Frozen buses in the front row (they thaw after 3, 6, 9… other buses have left). */
  frozen: number;
  crate: number;
  crateHp: number;
  links: number;
}

export function difficultyOf(n: number): Difficulty {
  if (n <= 4 || n === 6 || n === 8) return 'easy';
  if (n < 10) return 'normal';
  if (n % 10 === 0) return n === 10 ? 'hard' : 'super';
  if (n % 5 === 0) return 'hard';
  if (n % 5 === 1) return 'easy';
  if (n % 5 === 4 && n < 25) return 'easy';
  return 'normal';
}

/** First level (1-based) of each blocker — the intro card shows there. */
export const UNLOCK = { hidden: 6, tunnel: 11, lock: 16, frozen: 21, link: 26 } as const;

/**
 * The share of a level that plays smoothly: the buses needed for it come out of
 * the lot almost in order. Past it, the hidden rows' passengers pour in and the
 * late buses are scrambled: the puzzle starts there (60–70 % in).
 */
export const SMOOTH = 0.65;


/** The look per level: lavender toy town, desert sand (the newer reference), mint park, snow. */
export const THEMES = ['lavender', 'sand', 'mint', 'snow', 'halloween'] as const;
export type Theme = (typeof THEMES)[number];

/**
 * The run of themes and roads: a theme lasts a random 4–8 levels; the road is the classic
 * centred U on most levels, with one odd road in each run (two humps either way round, the
 * bridge with a pocket under it, the square loop with tunnels). The first four levels keep
 * the classic U. Fixed seed: every player sees the same run.
 */
const SCHEDULE = (() => {
  const rnd = mulberry32(20261012);
  const theme: Theme[] = [], layout: Layout[] = [];
  // the run of looks: the toy town for the first five levels, Halloween early (from level 6),
  // then Halloween comes back every other run between the other looks
  const RUN: Theme[] = ['lavender', 'halloween', 'sand', 'mint', 'halloween', 'snow', 'lavender', 'halloween', 'sand', 'mint', 'halloween', 'snow'];
  let t = 0;
  while (theme.length < LEVEL_COUNT) {
    const len = t === 0 ? 5 : 4 + Math.floor(rnd() * 5);
    const th = RUN[t++ % RUN.length];
    for (let k = 0; k < len && theme.length < LEVEL_COUNT; k++) theme.push(th);
  }
  // the road follows the difficulty curve: the classic U and the bridge on gentle levels, two
  // humps and the T in the middle, the tunnel rings on the hard ones (from the tunnels' level on)
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const n = i + 1, d = difficultyOf(n), r = rnd(), side = rnd() < 0.5 ? 'twin' : 'twinR';
    let l: Layout;
    if (n <= 4) l = 'center';
    else if (n === UNLOCK.tunnel) l = 'box';
    else if (d === 'easy') l = r < 0.65 ? 'center' : r < 0.82 ? 'arch' : side;
    else if (d === 'normal') l = r < 0.35 ? 'center' : r < 0.5 ? 'arch' : r < 0.72 ? side : 'tee';
    else if (d === 'hard') l = r < 0.2 ? 'center' : r < 0.45 ? 'tee' : r < 0.6 ? side : 'box';
    else l = r < 0.2 ? 'tee' : r < 0.35 ? side : r < 0.7 ? 'box' : 'boxTall';
    if ((l.startsWith('box') || l === 'arch') && n < UNLOCK.tunnel) l = n <= 6 ? 'center' : 'tee';
    layout.push(l);
  }
  return { theme, layout };
})();
export const layoutOf = (i: number): Layout => SCHEDULE.layout[i] ?? 'center';
export const themeOf = (i: number): Theme => SCHEDULE.theme[i] ?? 'lavender';

export function paramsOf(i: number): Params {
  const n = i + 1;
  const difficulty = difficultyOf(n);
  const hard = difficulty === 'hard' ? 1 : difficulty === 'super' ? 2 : 0;
  // a slow ramp across the 50 levels, under the saw-tooth of the difficulty tiers
  const ramp = Math.min(1, (n - 1) / 40);
  return {
    difficulty,
    // four columns on the gentle levels, five once there is more to juggle
    cols: difficulty === 'easy' || (difficulty === 'normal' && n < 15) ? 4 : 5,
    // every level starts with 6 buses allowed on the road; + adds more for free, up to MAX_SLOTS
    slots: 6,
    // more small buses on hard levels: more taps, more chances to jam the road
    // level 1 uses big loads only: few buses
    big: n === 1 ? 1 : n <= 3 ? 0.75 : difficulty === 'easy' ? 0.65 : difficulty === 'normal' ? 0.55 : 0.45 - hard * 0.05,
    // the first SMOOTH of the picture: buses come in the order they are needed
    window: n <= 3 ? 0.15 : 0.35,
    late: n <= 3 ? 0.3 : (difficulty === 'easy' ? 0.8 : difficulty === 'normal' ? 1.8 : 2.8 + hard * 0.8) + ramp * 0.8,
    mix: n <= 3 ? 1 : difficulty === 'easy' ? 0.9 : difficulty === 'normal' ? 0.7 : 0.5 - hard * 0.08,
    locks: n < UNLOCK.lock ? 0 : n === UNLOCK.lock ? 1 : Math.min(3, 1 + Math.floor((n - UNLOCK.lock) / 12) + (hard ? 1 : 0)),
    hidden: n < UNLOCK.hidden ? 0 : n === UNLOCK.hidden ? 0.3 : Math.min(0.35, 0.12 + (n - UNLOCK.hidden) * 0.006),
    // frozen passengers are retired: tunnels took their place
    ice: 0,
    // tunnels go in the ring roads' corners: one, both on the hardest levels
    // ring roads always have one (the crowd above pours into the pocket over it), both corners on the hardest
    tunnels: n < UNLOCK.tunnel || !(layoutOf(i).startsWith('box') || layoutOf(i) === 'arch') ? 0 : hard >= 2 && n > UNLOCK.tunnel ? 2 : 1,
    frozen: n < UNLOCK.frozen ? 0 : n === UNLOCK.frozen ? 2 : Math.min(3, 1 + Math.floor((n - UNLOCK.frozen) / 10) + (hard ? 1 : 0)),
    // the wooden crates are retired: Lock & Key took their place
    crate: 0,
    crateHp: 1,
    links: n < UNLOCK.link ? 0 : n === UNLOCK.link ? 2 : 1 + Math.floor((n - UNLOCK.link) / 15),
  };
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(a: T[], rnd: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Split one colour's `units` into bus loads as the reference does: mostly 100s
 * and 200s, the odd remainder on a bus of its own (153), or added to the last
 * one when it is small (207, 109).
 */
function split(units: number, rnd: () => number, big: number): number[] {
  if (units <= 230) return [units];
  const out: number[] = [];
  let left = units;
  while (left > 230) {
    const c = rnd() < big ? 200 : 100;
    out.push(c);
    left -= c;
  }
  if (left < 30) out[out.length - 1] += left;
  else out.push(left);
  return shuffle(out, rnd);
}

/** The board: 40 marbles across (odd rows one fewer), 40 rows on screen at the start, more waiting above. */
export const BOARD_W = 40;
export const BOARD_VIS = 40;

/**
 * Rows of marbles waiting above the screen: they pour down as the picture
 * empties. Always even, so a one-cell-per-marble picture keeps its rows' stagger.
 */
export function reserveRows(i: number): number {
  if (i === 3) return 24; // the dolphin level: about 900 passengers waiting above the screen
  const n = i + 1;
  if (n <= 3) return [6, 12, 18][i];
  const d = difficultyOf(n);
  return (Math.min(56, 20 + Math.floor(n * 0.6)) + (d === 'hard' ? 8 : d === 'super' ? 14 : 0)) & ~1;
}

/** The picture's background colour (the commonest on its border); the board keeps it as drawn. */
export function backdrop(rows: string[]): { bg: string; to: string } {
  const count = new Map<string, number>();
  const H = rows.length, W = rows[0].length;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (r === 0 || c === 0 || c === W - 1) count.set(rows[r][c], (count.get(rows[r][c]) ?? 0) + 1);
  const bg = [...count.entries()].sort((a, z) => z[1] - a[1])[0][0];
  return { bg, to: bg };
}

/** Board rows the header and HUD cover at the top of the screen. */
const HUD_ROWS = 4;

export function generate(i: number, seed: number, p: Params = paramsOf(i)): LevelSpec | null {
  const pic = PICTURES[i % PICTURES.length];
  const rnd = mulberry32(seed);
  // rows in place units: the lattice is ROW apart vertically
  const res = reserveRows(i);
  const rows = BOARD_VIS + res;
  const W = BOARD_W, vis = 1 + (BOARD_VIS - 1) * ROW, H = 1 + (rows - 1) * ROW;
  const layout = layoutOf(i);
  // Tunnels (ring roads only, as in the reference): the road dives underground at one of the
  // ring's top corners — in along the top lane or up a side lane, out round the corner on the
  // other one. Nobody is picked up on the way; passengers stand on the ground above.
  const tunnels: [number, number][] = [];
  const geo0 = geometry(W, H, vis, p.cols, layout);
  const ring = geo0.stems.find((st) => st.hollow);
  if (ring && p.tunnels > 0) {
    const pts = geo0.path, L = pts.length, lw = geo0.lw;
    const topLen = 2 * (ring.hw - lw / 2), laneLen = geo0.yT - (ring.stemTop + lw / 2);
    const corner = (x: number): number => {
      let best = 0, bd = Infinity;
      pts.forEach((q, k) => { const d = Math.hypot(q.x - x, q.y - (ring.stemTop + lw / 2)); if (d < bd) { bd = d; best = k; } });
      return best;
    };
    // buses drive anticlockwise: up the right lane, leftwards along the top, down the left lane
    if (!ring.rr || ring.rr >= ring.hw - 0.5) {
      // a round arch: the tunnel goes under its crown
      let c = 0, bd = Infinity;
      pts.forEach((q, k) => { const d = Math.hypot(q.x - ring.cx, q.y - (ring.stemTop + lw / 2)); if (d < bd) { bd = d; c = k; } });
      const half = Math.round(ring.hw * 0.42);
      tunnels.push([(c - half + L) % L, half * 2]);
    }
    const sides = tunnels.length ? [] : shuffle(['L', 'R'], rnd).slice(0, p.tunnels);
    for (const side of sides) {
      const c = corner(side === 'L' ? ring.xl : ring.xr);
      // two tunnels share the top lane: each takes less of it
      const topShare = sides.length > 1 ? 0.28 : 0.42;
      const before = Math.round(side === 'L' ? topLen * topShare : laneLen * 0.32);
      const after = Math.round(side === 'L' ? laneLen * 0.32 : topLen * topShare);
      tunnels.push([(c - before + L) % L, before + after]);
    }
  }
  const geo = tunnels.length ? geometry(W, H, vis, p.cols, layout, tunnels) : geo0;
  // Where the picture goes. A framed picture (an object on a plain backdrop) is cropped to its
  // object and scaled up into the board's free part above the road, centred: the object fills
  // the view instead of floating small in its backdrop. A scene covers the whole width, its top
  // on the board's top (its lower edge is the part the road crosses).
  const { bg, to } = backdrop(pic.rows);
  let prow = pic.rows;
  if (!pic.scene && !pic.full && i !== 3) {
    let t = prow.length, b = -1, l = prow[0].length, rgt = -1;
    prow.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== bg) { t = Math.min(t, y); b = Math.max(b, y); l = Math.min(l, x); rgt = Math.max(rgt, x); } });
    if (b >= t) prow = prow.slice(t, b + 1).map((row) => row.slice(l, rgt + 1));
  }
  const pw = prow[0].length, ph = prow.length;
  // the free band: from the board's top down to a little below the road's highest point
  const roadTop = Math.min(...geo.bodies.map((bd) => Math.min(...bd.pts.map((q) => q[1] - bd.hw))), geo.H);
  const free = Math.max(BOARD_VIS * 0.55, Math.min(BOARD_VIS, (roadTop - (H - vis)) / ROW + 4));
  let sc: number, x0: number, r0: number;
  // a scene shrinks into the free band, under the HUD (its lowest part a little beside the road),
  // and its edges carry on outwards: the sky to the sides, the ground below
  if (pic.full) { sc = 1; x0 = 0; r0 = res; }
  // a famous scene fills the board's width like the full pictures (its lower edge goes under the road)
  else if (pic.scene) { void free; sc = W / pw; x0 = 0; r0 = res - 1; }
  else if (i === 3) { sc = Math.min(W / pw, BOARD_VIS / ph); x0 = (W - pw * sc) / 2; r0 = res + BOARD_VIS - ph * sc; }
  else {
    // centred in what the player sees: below the HUD (its top HUD_ROWS rows) down to the road
    sc = Math.min((W * 0.94) / pw, (free - HUD_ROWS - 0.5) / ph);
    x0 = (W - pw * sc) / 2;
    r0 = res + HUD_ROWS + (free - HUD_ROWS - ph * sc) / 2;
  }
  const key = (k: string): number => COLOR_KEYS.indexOf(k === bg ? to : k);
  const xs: number[] = [], ys: number[] = [], cs: number[] = [], above: number[] = [];
  // the pockets inside ring roads reach below the board's edge: their places too
  const pocketBottom = Math.max(0, ...geo.pockets.map((pk) => pk.by));
  const rowsAll = Math.max(rows, Math.ceil((pocketBottom - 0.5) / ROW) + 1);
  for (let r = 0; r < rowsAll; r++) {
    for (let c = 0; c < W; c++) {
      // each row sits half a place off the one above (hexagonal packing)
      const x = c + 0.5 + (r & 1) * SHIFT, y = 0.5 + r * ROW;
      if (x > W - 0.25) continue;
      if (r >= rows && !geo.pockets.some((pk) => Math.abs(x - pk.cx) < pk.hw - ROAD_CLEAR && y < pk.by - ROAD_CLEAR)) continue;
      if (roadDist(geo, x, y) < ROAD_CLEAR) continue;
      let pc = Math.floor((x - 0.25 - x0) / sc), pr = Math.floor((Math.min(r, rows - 1) - r0) / sc);
      if (pic.scene || pic.full) { pc = Math.max(0, Math.min(pw - 1, pc)); pr = Math.max(0, Math.min(ph - 1, pr)); }
      const inside = pc >= 0 && pc < pw && pr >= 0 && pr < ph;
      xs.push(x); ys.push(y);
      if (r < res) { above.push(cs.length); cs.push(-1); } else cs.push(inside ? key(prow[pr][pc]) : key(bg));
    }
  }
  // above the screen: the picture's own colours mixed at random — in its own shares on easy
  // levels, flatter on hard ones (the rare colours become "key" colours the late game hinges on)
  const shares = new Array(COLOR_KEYS.length).fill(0);
  for (const c of cs) if (c >= 0) shares[c]++;
  const weights = shares.map((v) => (v > 0 ? Math.pow(v, p.mix) : 0));
  const wsum = weights.reduce((a, v) => a + v, 0);
  for (const k of above) {
    let t = rnd() * wsum, c = 0;
    while (c < weights.length - 1 && (t -= weights[c]) > 0) c++;
    while (!weights[c]) c--;
    cs[k] = c;
  }
  const n = xs.length;
  const color = Int8Array.from(cs);
  const ice = new Uint8Array(n), crate = new Uint8Array(n);
  // blockers sit on the visible part of the board, never right against the stem top
  const cells = shuffle([...Array(n).keys()].filter((k) => ys[k] > H - vis + 1), rnd);
  const nCrate = Math.round(n * p.crate);
  let placed = 0;
  for (const k of cells) {
    if (placed >= nCrate) break;
    if (cells.some((o) => crate[o] && Math.hypot(xs[o] - xs[k], ys[o] - ys[k]) < 2.2)) continue;
    crate[k] = p.crateHp > 1 && rnd() < 0.4 ? 2 : 1;
    placed++;
  }
  const nIce = Math.round(n * p.ice);
  let iced = 0;
  for (const k of cells) {
    if (iced >= nIce) break;
    if (crate[k]) continue;
    ice[k] = 1;
    iced++;
  }

  const base: LevelSpec = {
    index: i, name: pic.name, W, H, vis, x: Float64Array.from(xs), y: Float64Array.from(ys), color, ice, crate,
    cols: p.cols, buses: [], slots: p.slots, difficulty: p.difficulty, seed, layout, tunnels,
  };
  const os = new Sim(base);
  const order = os.oracle();
  if (!order) return null;
  const places = os.oraclePlaces;

  // Units per colour, split into buses; total bus count ≈ p.buses.
  const units = new Array(COLOR_KEYS.length).fill(0);
  for (const c of order) units[c]++;
  const total = order.length;
  const loads: { color: number; cap: number; need: number; at: number }[] = [];
  const firstAt: number[][] = units.map(() => []);
  order.forEach((c, k) => { firstAt[c].push(k); });
  for (let c = 0; c < units.length; c++) {
    if (!units[c]) continue;
    let at = 0;
    for (const cap of split(units[c], rnd, p.big)) {
      loads.push({ color: c, cap, need: firstAt[c][at], at });
      at += cap;
    }
  }
  // Needed-first order, blurred by a window (in bus positions): a small one for the buses of the
  // first SMOOTH of the picture, the level's `late` one for the rest (they only mix among themselves)
  const spread = total / Math.max(1, loads.length);
  const keyOfLoad = new Map(loads.map((l) => {
    const lateOne = l.need >= SMOOTH * total;
    const w = lateOne ? p.late : p.window;
    return [l, (lateOne ? total : 0) + l.need + (rnd() - 0.5) * 2 * w * spread] as const;
  }));
  loads.sort((a, b) => keyOfLoad.get(a)! - keyOfLoad.get(b)!);
  const C = p.cols;
  const buses: BusSpec[] = loads.map((l, k) => ({ id: k, color: l.color, cap: l.cap, col: 0, depth: Math.floor(k / C), hidden: false, link: -1, locked: false }));
  for (let d = 0; d * C < buses.length; d++) {
    const row = buses.slice(d * C, d * C + C);
    const colsFree = shuffle([...Array(C).keys()], rnd);
    row.forEach((b, k) => { b.col = colsFree[k]; });
  }
  // Level 2 teaches the merge: three of a colour wait at the front, to send together.
  if (i === 1) {
    const count = (c: number): number => buses.filter((b) => b.color === c).length;
    const c0 = buses.find((b) => count(b.color) >= 3)?.color ?? buses[0].color;
    const same = buses.filter((b) => b.color === c0);
    for (let k = 0; k < Math.min(3, same.length); k++) {
      const b = same[k], o = buses.find((x) => x.depth === 0 && x.col === k)!;
      [b.col, b.depth, o.col, o.depth] = [o.col, o.depth, b.col, b.depth];
    }
  }
  for (const b of buses) if (b.depth > 0 && rnd() < p.hidden) b.hidden = true;
  // Frozen buses (bus_new_4): front-row buses in ice; each one thaws after 3, 6, 9… other
  // buses have left the lot (never more than the buses the other columns hold)
  if (p.frozen > 0) {
    const fronts = shuffle(buses.filter((b) => b.depth === 0 && b.link < 0), rnd).slice(0, Math.min(p.frozen, C - 1));
    const frozenCols = new Set(fronts.map((b) => b.col));
    const others = buses.filter((b) => !frozenCols.has(b.col)).length;
    fronts.sort((a, z) => a.col - z.col).forEach((b, k) => { b.frozen = Math.min(3 * (k + 1), Math.max(1, others - 2)); b.hidden = false; });
  }
  let links = p.links;
  for (const b of shuffle([...buses], rnd)) {
    if (links <= 0) break;
    if (b.depth < 1 || b.link >= 0 || b.col + 1 >= C) continue;
    const o = buses.find((x) => x.depth === b.depth && x.col === b.col + 1);
    if (!o || o.link >= 0) continue;
    b.link = o.id;
    o.link = b.id;
    links--;
  }
  // Lock & Key (as in the reference): a parked bus is padlocked and another one carries a key on
  // its roof. Sending the key bus out collects the key; a padlocked bus at the front of its line
  // uses one to open. The key bus always stands EARLIER in the lot's order (in front, or in the
  // same row), so the key is in hand before the locked bus is needed.
  let locks = p.locks;
  const lockCands = shuffle(buses.filter((b) => b.depth >= 1 && b.link < 0 && !b.frozen), rnd);
  for (const lb of lockCands) {
    if (locks <= 0) break;
    const kb = shuffle(buses.filter((b) => b.id < lb.id - 1 && b.depth >= Math.max(0, lb.depth - 2) && !b.locked && !b.keyBus && !b.frozen && b.link < 0 && b.id !== lb.id), rnd)[0];
    if (!kb) continue;
    kb.keyBus = true;
    kb.hidden = false;
    lb.locked = true;
    lb.hidden = false;
    locks--;
  }
  // The lot must be able to empty on its own rules (frozen buses thaw as others leave, a rope
  // needs both ends at the front, a padlock needs a key from an earlier bus): untie ropes, then
  // thaw ice, then drop padlocks until it does — a front row of ice beside a roped pair whose
  // other end waits behind the ice locks the whole lot for good otherwise
  while (!lotClears(buses, C)) {
    const roped = buses.filter((b) => b.link >= 0);
    const iced = buses.filter((b) => (b.frozen ?? 0) > 0).sort((a, z) => (z.frozen ?? 0) - (a.frozen ?? 0));
    const padlocked = buses.filter((b) => b.locked);
    if (roped.length) { const b = roped[roped.length - 1]; buses[b.link].link = -1; b.link = -1; }
    else if (iced.length) iced[0].frozen = 0;
    else if (padlocked.length) padlocked[0].locked = false;
    else break;
  }
  // Level 1 cannot be lost: every bus fits on the road at once (so a bus can always be sent), and
  // with every colour's buses out together, someone by the road always has a bus to board
  if (i === 0) base.slots = Math.max(base.slots, buses.length);
  return { ...base, layout, tunnels, buses };
}

// ---------------------------------------------------------------- bot

/** The bot's choice among the parked buses right now, or -1 to wait. */
export function botPick(sim: Sim, rnd: () => number, eps = 0): number {
  const fronts = sim.fronts();
  const free = fronts.find((f) => sim.canTap(f.id) === 'free');
  if (free) return free.id;
  const cands = fronts.filter((f) => sim.canTap(f.id) === 'ok');
  if (!cands.length) return -1;
  const E = sim.exposure();
  const road = sim.onRoad();
  const busy = road.filter((b) => b.dry < sim.lapLen);
  const score = (id: number): number => {
    const b = sim.buses[id];
    const same = road.filter((o) => o.color === b.color);
    // marbles in reach that the buses already out there will not take care of
    const left = E[b.color] - same.reduce((a, o) => a + o.cap, 0) * 0.5;
    // a third bus of a colour merges on the road and frees two slots
    let s = same.length === 2 ? Math.max(left, 0) + 30 : left;
    if (b.link >= 0) s = Math.min(s, E[sim.buses[b.link].color]) - 2;
    return s;
  };
  let best = -1, bestS = -Infinity, bestKey = -Infinity;
  for (const f of cands) {
    const s = score(f.id), key = s + rnd() * 0.5; // the noise only breaks ties
    if (key > bestKey) { bestKey = key; bestS = s; best = f.id; }
  }
  if (rnd() < eps) best = cands[Math.floor(rnd() * cands.length)].id;
  // players are impatient: now and then they send a bus even with nothing for it in reach
  if (bestS > 0 || busy.length === 0 || rnd() < eps * 0.15) return best;
  return -1;
}

/** One game by the bot. True = cleared. */
export function botRun(spec: LevelSpec, rnd: () => number, eps = 0.12): boolean {
  const sim = new Sim(spec);
  for (let t = 0; t < 80000; t++) {
    if (sim.won()) return true;
    if (sim.stuck()) return false;
    if (t % 3 === 0) {
      const id = botPick(sim, rnd, eps);
      if (id >= 0) sim.tap(id);
      // the road is full and a bus waits: a player taps + (it is free, up to MAX_SLOTS)
      else if (sim.slots < sim.maxSlots && sim.freeSlots() <= 0 && sim.fronts().some((f) => sim.canTap(f.id) === 'full')) sim.addSlot();
    }
    sim.step();
  }
  return false;
}

/** Can the lot empty by its own rules alone (ignoring the road and the crowd)? */
export function lotClears(buses: BusSpec[], C: number): boolean {
  const cols: number[][] = Array.from({ length: C }, () => []);
  for (const b of [...buses].sort((a, z) => a.depth - z.depth)) cols[b.col].push(b.id);
  const frozen = buses.map((b) => b.frozen ?? 0);
  const locked = buses.map((b) => !!b.locked);
  let keys = 0, left = buses.length;
  const front = (id: number): boolean => cols.some((c) => c[0] === id);
  const leave = (id: number): void => {
    for (const c of cols) { const k = c.indexOf(id); if (k >= 0) c.splice(k, 1); }
    if (buses[id].keyBus) keys++;
    for (let o = 0; o < frozen.length; o++) if (o !== id && frozen[o] > 0) frozen[o]--;
    left--;
  };
  for (;;) {
    for (const c of cols) if (c.length && locked[c[0]] && keys > 0) { locked[c[0]] = false; keys--; }
    if (!left) return true;
    const id = cols.map((c) => c[0]).find((b) => b !== undefined && !locked[b] && frozen[b] <= 0 &&
      (buses[b].link < 0 || (front(buses[b].link) && !locked[buses[b].link] && frozen[buses[b].link] <= 0)));
    if (id === undefined) return false;
    const mate = buses[id].link;
    leave(id);
    if (mate >= 0) leave(mate);
  }
}

const cache = new Map<number, LevelSpec>();
export function getLevel(i: number): LevelSpec {
  let s = cache.get(i);
  if (!s) {
    const p = paramsOf(i);
    if (SLOTS[i]) p.slots = SLOTS[i];
    const knob = KNOBS[i] ?? 1;
    p.late *= knob;
    p.mix = Math.pow(p.mix, knob);
    const seed0 = SEEDS[i] ?? i * 1000 + 1;
    // a board that cannot empty fails every seed alike: give up loudly instead of hanging the game
    for (let seed = seed0; !s && seed < seed0 + 40; seed++) s = generate(i, seed, p) ?? undefined;
    if (!s) throw new Error(`Bus Loop: level ${i + 1} cannot be generated`);
    cache.set(i, s);
  }
  return s;
}

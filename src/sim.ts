// The rules of Bus Loop as a pure, tick-based simulation — no DOM, so the game
// and the tuning bot (node scripts/tune.ts) play exactly the same game.
//
// The picture is a crowd standing on a fixed staggered lattice (each row half a
// place off the one above). A road loops round a median above the parking lot
// and rises into the crowd's bottom centre (the "stem"). Buses ride the loop and
// board in turns: a turn starts only from a seed passenger of the bus's colour with
// road access (an 8-connected chain of empty places back to the road, diagonals
// across corners allowed); then everyone of that colour within a radius round the
// bus (frozen where it stood) joins the group. The group climbs aboard, their places
// free up — possibly opening the way to those behind — and the bus looks for the
// next seed. Whenever a place empties, the person diagonally above it and
// further out steps in, and the one behind them, all the way up that diagonal:
// the crowd flows inwards along diagonals towards the stem, and the four corners
// wear away. A bus with nothing left to carry leaves; three buses of one colour
// on the road merge into one. A full road whose buses all lap once with no
// pickup = the round is lost.

export const COLOR_KEYS = 'ROYGCBPKWDNS';

export interface BusSpec {
  id: number;
  color: number;
  cap: number;
  col: number;
  depth: number;
  hidden: boolean;
  /** Id of the bus it is roped to (they leave together), -1 for none. */
  link: number;
  /** Padlocked: it cannot leave until a collected key opens it at the front of its line. */
  locked?: boolean;
  /** Carries a key on its roof: sending it out collects the key. */
  keyBus?: boolean;
  /** Frozen in a block of ice: it thaws after this many other buses have left the lot. */
  frozen?: number;
}

export interface LevelSpec {
  index: number;
  name: string;
  /** Board width and height (marble units). The top `H - vis` is above the screen at the start. */
  W: number;
  H: number;
  vis: number;
  /** The places: positions (fixed), colour (-1 empty), ice layers, crate hit points. */
  x: Float64Array;
  y: Float64Array;
  color: Int8Array;
  ice: Uint8Array;
  crate: Uint8Array;
  /** Per place: the id of the locked bus whose key that passenger carries (-1 none). */
  key?: Int16Array;
  cols: number;
  buses: BusSpec[];
  slots: number;
  difficulty: 'easy' | 'normal' | 'hard' | 'super';
  seed: number;
  /** The road's layout (stems), 'center' when absent. */
  layout?: Layout;
  /** Tunnels: [first road point, length in points]. */
  tunnels?: [number, number][];
}

export const EMPTY = -1;

/** Everything about the board, road and lot, in marble units (a marble is 1 across). */
export interface Geo {
  W: number; H: number; vis: number;
  s0: number; sw: number; stemTop: number;
  /** lane width, median width, gap under the board */
  lw: number; m: number; g: number;
  /** top lane, median centre, bottom lane (y) */
  yT: number; ym: number; yB: number;
  /** median ends (x) and the turning radius round them */
  xL: number; xR: number; R: number;
  /** the tallest stem's lanes (x), U-turn centre and radius */
  xl: number; xr: number; cx: number; cyU: number; Ru: number;
  /** the slab: outer edges, corner radius, lot top, the gate lane, columns */
  lotL: number; lotR: number; rc: number; lotTop: number; laneX: number; colX: number[]; rowH: number; row0: number;
  /** bus width */
  bw: number;
  /** where gravity pulls: the road's counter */
  gx: number; gy: number;
  /** Where the road climbs into the picture, left to right (for which side a bus serves). */
  stems: Stem[];
  /**
   * The road above the slab as solid bands (a polyline and a half-width): the stems' bodies,
   * or a hollow ring's lane. Tunnels cut them: that stretch runs underground.
   */
  bodies: Band[];
  /** The median grooves (dark channels between two lanes). */
  medians: Band[];
  /** Pockets inside hollow rings: ground with passengers (the slab under them is no wall). */
  pockets: Pocket[];
  /** The loop the buses drive, one point per marble of road, in driving order, and where each lot column joins it. */
  path: PathPt[];
  entries: number[];
}

/** A stretch of road: a polyline widened by hw either side (round ends). */
export interface Band { pts: [number, number][]; hw: number }
/** The ground inside a hollow ring: a box of half-width hw from ty down, its top corners rounded by rr. */
export interface Pocket { cx: number; hw: number; ty: number; rr: number; by: number }

/**
 * One place the road climbs into the picture: a box of half-width `hw` rising to
 * `stemTop`, top corners rounded by `rr`; `cyU` is where its lanes start to turn.
 */
export interface Stem {
  s0: number; sw: number; stemTop: number; xl: number; xr: number; cx: number; cyU: number; Ru: number;
  hw: number; rr: number; hollow: boolean;
}

export interface PathPt { x: number; y: number }

/**
 * Road layouts (sizes as shares of the board's width, heights as shares of the visible board):
 * - center: the classic U up the middle;
 * - twin / twinR: two humps, the left low and the right tall, or the other way round;
 * - arch: a wide bridge with a pocket of passengers under it (bus_new_1);
 * - box / boxTall: a square ring round a pocket; its corner tunnels come from the level (ref 1);
 * - tee: up the middle into a long bar across the picture, a T-shaped groove inside (ref 2).
 */
type StemDef = { x: number; top: number; hw?: number; round?: number; hollow?: boolean };
type LayoutDef = { lw: number; m: number; stems?: StemDef[]; tee?: { top: number; l: number; r: number } };
export const LAYOUTS: Record<string, LayoutDef> = {
  center: { lw: 0.136, m: 0.068, stems: [{ x: 0.5, top: 0.38 }] },
  twin: { lw: 0.108, m: 0.054, stems: [{ x: 0.3, top: 0.22, hw: 0.135 }, { x: 0.7, top: 0.4, hw: 0.135 }] },
  twinR: { lw: 0.108, m: 0.054, stems: [{ x: 0.3, top: 0.4, hw: 0.135 }, { x: 0.7, top: 0.22, hw: 0.135 }] },
  arch: { lw: 0.115, m: 0.058, stems: [{ x: 0.5, top: 0.42, hw: 0.335, hollow: true }] },
  box: { lw: 0.115, m: 0.058, stems: [{ x: 0.5, top: 0.42, hw: 0.335, round: 0.07, hollow: true }] },
  boxTall: { lw: 0.115, m: 0.058, stems: [{ x: 0.5, top: 0.48, hw: 0.33, round: 0.1, hollow: true }] },
  tee: { lw: 0.12, m: 0.06, tee: { top: 0.37, l: 0.28, r: 0.72 } },
};
export type Layout = 'center' | 'twin' | 'twinR' | 'arch' | 'box' | 'boxTall' | 'tee';

export function geometry(W: number, H: number, vis: number, cols: number, layout: Layout = 'center', tunnels: [number, number][] = []): Geo {
  // lanes: a lane's clear width (inside its thick curbs) holds a whole bus, double- and
  // triple-deckers included; the centred U is 34 % of the board wide
  const def = LAYOUTS[layout];
  const lw = W * def.lw, m = W * def.m, g = 0.15;
  const yT = H + g + lw / 2, ym = H + g + lw + m / 2, yB = H + g + lw + m + lw / 2;
  const R = ym - yT;
  // the slab sits a little inside the board (ground and bushes either side, as in the reference)
  const lotL = W * 0.067, lotR = W * 0.937;
  // a wide ring may start its lanes right at the slab's ends
  const xL = lotL + 0.3 + lw / 2 + R, xR = lotR - 0.3 - lw / 2 - R;
  const lotTop = yB + lw / 2;
  const laneX = lotL + (lotR - lotL) * 0.074;
  const c0 = lotL + (lotR - lotL) * 0.232, c1 = lotR - (lotR - lotL) * 0.057;
  const pitch = (c1 - c0) / cols;
  const colX = Array.from({ length: cols }, (_, k) => c0 + (k + 0.5) * pitch);
  // parked buses as measured on the reference: 64 % of a column wide (a little more in five columns)
  const bw = pitch * (cols >= 5 ? 0.74 : 0.64);
  const rowH = bw * 1.47;

  const stems: Stem[] = [];
  const bodies: Band[] = [], medians: Band[] = [], pockets: Pocket[] = [];
  const verts: [number, number][] = [[xL, yT]];
  const arcV = (cx0: number, cy0: number, r: number, a0: number, a1: number): void => {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r * 2));
    for (let k = 1; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; verts.push([cx0 + r * Math.cos(a), cy0 + r * Math.sin(a)]); }
  };
  if (def.tee) {
    // the T: up the middle, out along the bar's lower lane to its left end, round, along the
    // upper lane to the right end, round, back along the lower lane and down the middle
    const cx = W / 2, off = lw + m, yA = H - vis * def.tee.top + off, yc = yA - off / 2, r = off / 2, rc = lw * 0.6;
    const xsl = cx - m / 2 - lw / 2, xsr = cx + m / 2 + lw / 2, xEL = W * def.tee.l, xER = W * def.tee.r;
    verts.push([xsl, yT], [xsl, yA + rc]);
    arcV(xsl - rc, yA + rc, rc, 0, -Math.PI / 2);
    verts.push([xEL, yA]);
    arcV(xEL, yc, r, Math.PI / 2, Math.PI * 1.5);
    verts.push([xER, yA - off]);
    arcV(xER, yc, r, -Math.PI / 2, Math.PI / 2);
    verts.push([xsr + rc, yA]);
    arcV(xsr + rc, yA + rc, rc, -Math.PI / 2, -Math.PI);
    verts.push([xsr, yT]);
    const hw = lw + m / 2;
    bodies.push({ pts: [[cx, yc], [cx, H + g + lw]], hw }, { pts: [[xEL, yc], [xER, yc]], hw });
    medians.push({ pts: [[cx, yc], [cx, ym]], hw: m / 2 }, { pts: [[xEL, yc], [xER, yc]], hw: m / 2 });
    stems.push({ s0: cx - hw, sw: hw * 2, stemTop: yc - hw, xl: xsl, xr: xsr, cx, cyU: yc, Ru: r, hw, rr: hw, hollow: false });
  } else {
    for (const st of def.stems!) {
      const hw = W * (st.hw ?? (def.lw * 2 + def.m) / 2);
      const rr = st.round !== undefined ? W * st.round : hw;
      const cx = W * st.x, stemTop = H - vis * st.top;
      // the lane's centre line turns round the top corners on this radius
      const Ru = Math.max(0.8, rr - lw / 2);
      stems.push({ s0: cx - hw, sw: hw * 2, stemTop, xl: cx - hw + lw / 2, xr: cx + hw - lw / 2, cx, cyU: stemTop + lw / 2 + Ru, Ru, hw, rr, hollow: !!st.hollow });
    }
    for (const st of [...stems].sort((a, b) => a.cx - b.cx)) {
      // up the left lane, round the top corners (a half-circle for a round stem), down the right lane
      const off = st.hw - lw / 2 - st.Ru, cl = st.cx - off, cr = st.cx + off;
      verts.push([st.xl, yT], [st.xl, st.cyU]);
      arcV(cl, st.cyU, st.Ru, Math.PI, Math.PI * 1.5);
      if (off > 0.01) verts.push([cr, st.cyU - st.Ru]);
      arcV(cr, st.cyU, st.Ru, Math.PI * 1.5, Math.PI * 2);
      verts.push([st.xr, yT]);
      if (st.hollow) pockets.push({ cx: st.cx, hw: st.hw - lw, ty: st.stemTop + lw, rr: Math.max(0.5, st.rr - lw), by: ym - m / 2 - 0.6 });
      else {
        bodies.push({ pts: [[st.cx, st.stemTop + st.hw], [st.cx, H + g + lw]], hw: st.hw });
        medians.push({ pts: [[st.cx, st.cyU], [st.cx, ym]], hw: m / 2 });
      }
    }
  }
  verts.push([xR, yT]);
  arcV(xR, ym, R, -Math.PI / 2, Math.PI / 2);
  verts.push([xL, yB]);
  arcV(xL, ym, R, Math.PI / 2, Math.PI * 1.5);
  // the loop resampled at one marble per point; the vertices run clockwise, buses the other way
  const path: PathPt[] = [];
  let carry = 0;
  for (let i = 1; i < verts.length; i++) {
    const [ax, ay] = verts[i - 1], [bx, by] = verts[i];
    const d = Math.hypot(bx - ax, by - ay);
    let t = carry;
    while (t < d) { path.push({ x: ax + ((bx - ax) * t) / d, y: ay + ((by - ay) * t) / d }); t += 1; }
    carry = t - d;
  }
  path.reverse();
  // a bus leaving column k joins the bottom lane right above it
  const entries = colX.map((x) => {
    let best = 0, bd = Infinity;
    path.forEach((p, i) => { const d = Math.abs(p.y - yB) < 0.01 ? Math.abs(p.x - x) : Infinity; if (d < bd) { bd = d; best = i; } });
    return best;
  });
  // a hollow ring's road is its lane itself, up to where tunnels take it underground
  if (stems.some((s) => s.hollow)) {
    const under = new Uint8Array(path.length);
    for (const [a, len] of tunnels) for (let k = 0; k < len; k++) under[(a + k) % path.length] = 1;
    const onRing = (p: PathPt): boolean => p.y < yT - 0.01 && stems.some((s) => s.hollow && Math.abs(p.x - s.cx) <= s.hw + 0.01);
    let run: [number, number][] = [];
    const flush = (): void => { if (run.length > 1) bodies.push({ pts: run, hw: lw / 2 }); run = []; };
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (onRing(p) && !under[i]) run.push([p.x, p.y]); else flush();
    }
    flush();
  }
  const main = stems.reduce((a, b) => (b.stemTop < a.stemTop ? b : a));
  return {
    W, H, vis, s0: main.s0, sw: main.sw, stemTop: main.stemTop, lw, m, g, yT, ym, yB, xL, xR, R,
    xl: main.xl, xr: main.xr, cx: main.cx, cyU: main.cyU, Ru: main.Ru,
    lotL, lotR, rc: lw * 0.8, lotTop, laneX, colX, rowH, row0: lotTop + 0.6 + rowH / 2, bw,
    gx: W / 2, gy: ym, stems, bodies, medians, pockets, path, entries,
  };
}

/** How far a passenger stands from the road's edge (places): close enough that the column nearest each side of the stem stands right by the curb, a thin strip of ground still showing. */
export const ROAD_CLEAR = 0.65;

/** Signed distance to a box of half-width hw centred on cx, rising to ty with top corners of radius rr, open downwards. */
function boxDist(x: number, y: number, cx: number, hw: number, ty: number, rr: number): number {
  const qx = Math.abs(x - cx) - (hw - rr), qy = ty + rr - y;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
}

/** Signed distance to a band (negative inside). */
export function bandDist(b: Band, x: number, y: number): number {
  const p = b.pts;
  let best = Infinity;
  for (let i = 1; i < p.length; i++) {
    const ax = p[i - 1][0], ay = p[i - 1][1], dx = p[i][0] - ax, dy = p[i][1] - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
    if (d < best) best = d;
  }
  return best - b.hw;
}

/**
 * Distance from a point to the road's wall (negative inside the road): the bands above the
 * slab, the slab a rounded box under the board. Inside a hollow ring's pocket only its lanes
 * count (the slab under the pocket is no wall: nobody drives there).
 */
export function roadDist(g: Geo, x: number, y: number): number {
  const top = g.H + g.g;
  let best = Infinity;
  for (const b of g.bodies) best = Math.min(best, bandDist(b, x, y));
  // the pocket reaches down to the median (its floor is the curb along it)
  for (const pk of g.pockets) if (y < pk.by && boxDist(x, y, pk.cx, pk.hw, pk.ty, pk.rr) < 0) return best;
  const qx = Math.max(g.lotL + g.rc - x, x - (g.lotR - g.rc), 0), qy = Math.max(top + g.rc - y, 0);
  const slab = Math.hypot(qx, qy) - g.rc;
  return Math.min(best, slab);
}

/** The loop (see Geo.path). */
export function buildPath(geo: Geo): { pts: PathPt[]; entries: number[] } {
  return { pts: geo.path, entries: geo.entries };
}

export interface SimBus {
  id: number;
  color: number;
  cap: number;
  /** Merged buses get floors by load: ≤100 one, ≤300 two, more three. */
  merged: boolean;
  hidden: boolean;
  link: number;
  /** Padlocked until a collected key opens it (at the front of its line). */
  locked: boolean;
  /** Carries a key: sending it out adds the key to the counter. */
  keyBus: boolean;
  /** Buses still to leave the lot before its ice melts (0 = not frozen). */
  frozen: number;
  /** Column it left from (where it joins the road). */
  col: number;
  /** 'exit': full, still driving on the road (it holds its place, no overtaking) to the way out; it takes no slot. */
  where: 'lot' | 'enter' | 'road' | 'exit' | 'gone';
  /** On its way out: road points left to the exit. */
  exitLeft?: number;
  pos: number;
  enterT: number;
  /** Ticks on the road since this bus last took a marble. */
  dry: number;
  steps: number;
  /** Road position at the start of this tick (pos is continuous: road points, wrapping at the lap). */
  pos0: number;
  /** Speed in road points per tick: eases down while collecting, back up after, never into the bus ahead. */
  v: number;
  /** Took someone last tick. */
  busy: boolean;
  /**
   * Boarding state machine: 'search' (looking for a seed with road access) or
   * 'boarding' (a group is reserved and climbing aboard; no new picks until done).
   */
  phase: 'search' | 'boarding';
  /** The frozen radius centre of the current activation (road point coordinates), for tests and debugging. */
  cx: number;
  cy: number;
  /** The group picked in this activation (places already freed), its seed, and ticks left until all are aboard. */
  group: number[];
  seed: number;
  boardT: number;
}

export const tierOf = (b: { cap: number; merged: boolean }): number => (!b.merged || b.cap <= 100 ? 1 : b.cap <= 300 ? 2 : 3);

export type SimEvent =
  | { t: 'take'; bus: number; cell: number; color: number; ice: boolean }
  | { t: 'unlock'; bus: number; cell: number }
  | { t: 'key'; bus: number }
  | { t: 'thaw'; bus: number }
  | { t: 'exited'; bus: number }
  | { t: 'move'; from: number; to: number }
  | { t: 'crate'; cell: number; left: number }
  | { t: 'done'; bus: number; free: boolean }
  | { t: 'enter'; bus: number }
  | { t: 'merge'; bus: number; absorbed: number[] }
  | { t: 'sweep'; cell: number; what: 'ball' | 'ice' | 'crate'; color: number };

export const ENTER_TICKS = 4;
/** Marbles one bus can take per tick, and how deep past the wall it reaches (marbles). */
const TAKE = 5;
/** Radius round the bus inside which more passengers of its colour may join a seed: past the wall by this many places. */
export const BOARD_REACH = 3.2;
/** Ticks a reserved group takes to climb aboard. */
export const BOARD_TICKS = 5;
/** Ticks between two passengers of a group setting off for the bus (they board one by one). */
export const BOARD_STAGGER = 0.5;
/** Groups larger than this board as a quick stream (the gap between passengers shrinks so the whole group takes as long as this many). */
export const STREAM = 20;
/** How far from the bus (past the lane's half width) it collects, in places. */
const PICK = 3.5;
/** Cruising speed and collecting speed (road points per tick); buses ease between them. */
const CRUISE = 1;
const CRAWL = 0.6;
const GAP = 6;
/** Rows of the lattice are this far apart (places are 1 apart along a row), as measured on the reference… */
export const ROW = 1;
/** …and each row sits about a third of a place off the one above. */
export const SHIFT = 0.35;
/** The octagon's corner cuts, as a share of the board's width: top corners and bottom corners. */
export const CUT_TOP = 0.28;
export const CUT_BOTTOM = 0.1;
export class Sim {
  readonly spec: LevelSpec;
  readonly geo: Geo;
  readonly pts: PathPt[];
  readonly entries: number[];
  readonly n: number;
  /** Bumper-to-bumper distance buses keep on the road (road points). */
  readonly spacing: number;
  /** Radius round the bus for joiners (the lane's half width plus BOARD_REACH). */
  readonly boardRadius: number;
  /** The final rush: with six buses or fewer left, joiners are gathered from twice as far and the group boards twice as fast. */
  rushOn(): boolean {
    return this.buses.filter((b) => b.where === 'lot' || b.where === 'enter' || b.where === 'road').length <= 6;
  }
  /** Place positions (fixed; x0/y0 alias them for the renderer). */
  x: Float64Array;
  y: Float64Array;
  x0: Float64Array;
  y0: Float64Array;
  color: Int8Array;
  ice: Uint8Array;
  crate: Uint8Array;
  /** Per place: the locked bus whose key its passenger carries (-1 none); keys travel with the passengers. */
  keyOf: Int16Array;
  /** Buses unlocked since the last flush, with the place their key was picked up at. */
  private unlockQ: { bus: number; cell: number }[] = [];
  /** Where each person may step when free, best first: towards the road, diagonally down and inwards. */
  readonly steps: Int32Array[];
  /** Inside the board's octagon (people may step into these places); the cut-off corners are not. */
  readonly open: Uint8Array;
  /** Places nearest the road first (the order people step in, so a whole line moves at once). */
  readonly order: Int32Array;
  /** The two places diagonally below (towards the road), -1 when missing. */
  readonly below: Int32Array;
  /** All places touching each place. */
  readonly nb: Int32Array[];
  /** Per road point: the places in its collecting zone, in pick order (nearest the bus, then row, then column). */
  readonly near: Int32Array[];
  /** The logical grid: row/column of each place, the place in each slot (-1 none), road slots (access sources). */
  readonly row: Int32Array;
  readonly col: Int32Array;
  readonly rows: number;
  readonly cols: number;
  readonly slot: Int32Array;
  readonly road: Uint8Array;
  /** Empty places joined to the road through empty places, 8-connected (rebuilt whenever the crowd changes). */
  readonly reach: Uint8Array;
  /** Passengers reserved by a bus (boarding): they keep their place until the group is aboard. */
  readonly reserved: Uint8Array;
  /** Per road point: the places right against the wall beside it (crates there get knocked). */
  readonly curb: Int32Array[];
  units: number[];
  buses: SimBus[];
  columns: number[][];
  slots: number;
  ticks = 0;
  /** Keys collected and not yet used (Lock & Key). */
  keys = 0;
  /** + opens road slots for free up to this many. */
  maxSlots = 8;
  /** Moves the crowd made in the last settle (0 = at rest). */
  lastMoves = 0;
  /** Ticks the round has been hopeless in a row (see stuck()). */
  doomT = 0;
  /** The collecting zone's radius round a road point, and every place (for wide scans). */
  readonly zoneR: number;
  readonly allPlaces: Int32Array;
  /** Per road point: under a tunnel (no pickups there). */
  readonly tunnelAt: Uint8Array;
  /** Per place: it lies in some road point's collecting zone. */
  readonly inZone: Uint8Array;
  /** Per place: right by the road, where passing buses knock crates. */
  readonly inCurb: Uint8Array;

  constructor(spec: LevelSpec) {
    this.spec = spec;
    this.geo = geometry(spec.W, spec.H, spec.vis, spec.cols, spec.layout ?? 'center', spec.tunnels ?? []);
    const p = buildPath(this.geo);
    this.pts = p.pts;
    this.entries = p.entries;
    const n = (this.n = spec.color.length);
    // the gap buses keep on the road stays what the levels were tuned with (the original
    // 0.278-wide stem's lane), so neither the lot's art nor the wider road moves the rules
    const roadBw = Math.min(Math.max(6, this.geo.W * 0.278) * 0.36 * 1.12, (this.geo.colX[1] - this.geo.colX[0]) * 0.8);
    // buses never overlap, round the U-turns too: a bus is about 1.5 bus widths long, plus a
    // gap that keeps the chord between two buses on the tightest turn longer than a bus
    this.spacing = Math.max(roadBw * 1.32 + 0.8, 1.5 * this.geo.bw + 3);
    this.boardRadius = this.geo.lw / 2 + BOARD_REACH;
    this.x = spec.x.slice();
    this.y = spec.y.slice();
    this.x0 = this.x;
    this.y0 = this.y;
    this.color = spec.color.slice();
    this.ice = spec.ice.slice();
    this.crate = spec.crate.slice();
    this.keyOf = spec.key ? spec.key.slice() : new Int16Array(spec.color.length).fill(-1);
    // the lattice: rows ROW apart, each row shifted SHIFT of a place from the one above;
    // places are found by (row, quarter-column)
    const key = (x: number, y: number): number => Math.round((y - 0.5) / ROW) * 8192 + Math.round(x * 4);
    const at = new Map<number, number>();
    for (let i = 0; i < n; i++) at.set(key(this.x[i], this.y[i]), i);
    const find = (x: number, y: number): number => at.get(key(x, y)) ?? -1;
    const g = this.geo;
    // the pile falls towards the nearest road wall, as in the reference: straight down onto
    // the lot's shoulders, sideways into the stem — with gravity on top, so a marble can
    // always drop into the gap right under it and the pile keeps a flat bottom along the road
    // Above the screen the waiting marbles also lean towards the middle: they pour in through
    // the top centre (the inverted triangle of the reference) and leave the top corners to drain.
    const yTop = g.H - g.vis;
    // inside a ring's pocket the crowd mostly falls straight down (and fills it from the top,
    // through the tunnel over the ring), drifting a little towards the ring's lanes
    const inPocket = (x: number, y: number): boolean => g.pockets.some((pk) => y > pk.ty && y < pk.by && Math.abs(x - pk.cx) < pk.hw);
    // under a stretch of road that runs across (the T's bar): the crowd falls straight down into
    // the room below it instead of clinging to the road above
    const roofs = g.bodies.filter((b) => b.pts.length === 2 && Math.abs(b.pts[0][1] - b.pts[1][1]) < 0.01);
    const underRoof = (x: number, y: number): boolean => y < g.H && roofs.some((b) => y > b.pts[0][1] + b.hw && x > Math.min(b.pts[0][0], b.pts[1][0]) - b.hw - 4 && x < Math.max(b.pts[0][0], b.pts[1][0]) + b.hw + 4);
    const stem = (x: number, y: number): number => inPocket(x, y) || underRoof(x, y)
      ? 0.25 * roadDist(g, x, y) - 0.8 * y
      : roadDist(g, x, y) - 0.3 * y + (y < yTop ? 0.6 * Math.abs(x - g.W / 2) : 0);
    // the board's octagon: the four corners are cut at 45° (top ones from the top of the
    // visible board, bottom ones from the bar). Marbles may leave a corner but never step
    // into one, from inside or from the pile above, so a corner once cleared stays clear
    // (marbles already in a corner may move on through it).
    const cutTop = g.W * CUT_TOP, cutBottom = g.W * CUT_BOTTOM;
    this.open = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = this.x[i], y = this.y[i], side = Math.min(x, g.W - x);
      this.open[i] = side + (y - yTop) >= cutTop && side + (g.H - y) >= cutBottom ? 1 : 0;
    }
    const pot = new Float64Array(n);
    for (let i = 0; i < n; i++) pot[i] = stem(this.x[i], this.y[i]);
    this.steps = [];
    this.below = new Int32Array(n * 2).fill(-1);
    this.nb = [];
    for (let i = 0; i < n; i++) {
      const x = this.x[i], y = this.y[i];
      // neighbours: the two beside it and the nearest two in the rows above and below
      const around: number[] = [find(x - 1, y), find(x + 1, y)];
      for (const dy of [-ROW, ROW]) for (const dx of [-1.25, -1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1, 1.25]) {
        const k = find(x + dx, y + dy);
        if (k >= 0 && Math.abs(dx) < 1.3) around.push(k);
      }
      const near = around.filter((k) => k >= 0 && Math.hypot(this.x[k] - x, this.y[k] - y) < 1.45);
      this.nb.push(Int32Array.from(near));
      const lower = near.filter((k) => this.y[k] > y + 0.1).sort((a1, z) => Math.abs(this.x[a1] - x) - Math.abs(this.x[z] - x));
      this.below[i * 2] = lower[0] ?? -1;
      this.below[i * 2 + 1] = lower[1] ?? -1;
      // which way to go: down the slope to the nearest road wall, tipped downwards, so
      // the crowd beside the stem slides in diagonally and the rest falls in towards it
      const e = 0.05;
      let dx = stem(x - e, y) - stem(x + e, y), dy = stem(x, y - e) - stem(x, y + e);
      const l = Math.hypot(dx, dy) || 1;
      dx = dx / l; dy = dy / l + 0.45;
      const l2 = Math.hypot(dx, dy) || 1;
      dx /= l2; dy /= l2;
      // candidate steps: any neighbour closer to the road, best aligned first (never against the flow)
      const opts = near
        .filter((k) => pot[k] < pot[i] - 0.05 && (this.open[k] || (!this.open[i] && (this.y[i] >= yTop || this.y[k] < yTop))))
        .map((k) => { const vx = this.x[k] - x, vy = this.y[k] - y, vl = Math.hypot(vx, vy); return [k, (vx * dx + vy * dy) / vl] as const; })
        .filter(([, d]) => d > 0)
        .sort((a1, z) => z[1] - a1[1])
        .slice(0, 4)
        .map(([k]) => k);
      this.steps.push(Int32Array.from(opts));
    }
    // nearest the road first, so a whole line moves along in one tick
    this.order = Int32Array.from([...Array(n).keys()].sort((a1, z) => pot[a1] - pot[z]));
    // the logical grid (row, column) — the partial offset only moves the drawing
    this.row = new Int32Array(n);
    this.col = new Int32Array(n);
    let maxR = 0;
    for (let i = 0; i < n; i++) {
      const r = Math.round((this.y[i] - 0.5) / ROW);
      this.row[i] = r;
      this.col[i] = Math.round(this.x[i] - 0.5 - (r & 1) * SHIFT);
      maxR = Math.max(maxR, r);
    }
    // one extra row under the crowd: the bar's top lane runs there (road access along the bottom)
    this.rows = maxR + 2;
    this.cols = Math.round(g.W);
    this.slot = new Int32Array(this.rows * this.cols).fill(-1);
    for (let i = 0; i < n; i++) this.slot[this.row[i] * this.cols + this.col[i]] = i;
    // a slot with no place in it is road (an access source) when it lies on the road, else a wall
    this.road = new Uint8Array(this.rows * this.cols);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (this.slot[r * this.cols + c] >= 0) continue;
      const x = c + 0.5 + (r & 1) * SHIFT, y = 0.5 + r * ROW;
      if (roadDist(g, x, y) < ROAD_CLEAR + 0.1 || (r === this.rows - 1 && x > g.lotL && x < g.lotR)) this.road[r * this.cols + c] = 1;
    }
    this.reach = new Uint8Array(n);
    this.reserved = new Uint8Array(n);
    // each road point's collecting zone, in a stable pick order
    const zone = g.lw / 2 + PICK;
    this.near = this.pts.map((q) => {
      const found: [number, number][] = [];
      if (q.y - zone <= g.H) for (let i = 0; i < n; i++) { const d = Math.hypot(this.x[i] - q.x, this.y[i] - q.y); if (d <= zone) found.push([Math.round(d * 100), i]); }
      found.sort((a1, z) => a1[0] - z[0] || this.row[a1[1]] - this.row[z[1]] || this.col[a1[1]] - this.col[z[1]]);
      return Int32Array.from(found.map((f) => f[1]));
    });
    // tunnels: the road runs under a cover there; buses inside pick no one up
    this.tunnelAt = new Uint8Array(this.pts.length);
    for (const [a, len] of spec.tunnels ?? []) for (let k = 0; k < len; k++) {
      const at = (a + k) % this.pts.length;
      this.tunnelAt[at] = 1;
      this.near[at] = new Int32Array(0);
    }
    this.zoneR = zone;
    this.allPlaces = Int32Array.from({ length: n }, (_, i) => i);
    this.inZone = new Uint8Array(n);
    for (const list of this.near) for (const k of list) this.inZone[k] = 1;
    this.curb = this.near.map((list) => Int32Array.from([...list].filter((k) => roadDist(g, this.x[k], this.y[k]) < ROAD_CLEAR + 0.7)));
    this.inCurb = new Uint8Array(n);
    for (const list of this.curb) for (const k of list) this.inCurb[k] = 1;
    this.units = new Array(COLOR_KEYS.length).fill(0);
    for (let i = 0; i < n; i++) if (this.color[i] >= 0) this.units[this.color[i]] += 1 + this.ice[i];
    this.buses = spec.buses.map((b) => ({ id: b.id, color: b.color, cap: b.cap, merged: false, hidden: b.hidden, link: b.link, locked: !!b.locked, keyBus: !!b.keyBus, frozen: b.frozen ?? 0, col: b.col, where: 'lot', pos: -1, enterT: 0, dry: 0, steps: 0, pos0: -1, v: 1, busy: false, phase: 'search', cx: 0, cy: 0, group: [], seed: -1, boardT: 0 }));
    this.columns = Array.from({ length: spec.cols }, () => [] as number[]);
    for (const b of [...spec.buses].sort((a, z) => a.depth - z.depth)) this.columns[b.col].push(b.id);
    this.slots = spec.slots;
    this.reveal();
    this.rebuildReach();
  }

  // ------------------------------------------------------------ access (8-connected flood fill)

  /** The 8 neighbouring slots of place i, by row/column. Calls fn(slotIndex). */
  private each8(i: number, fn: (s: number) => void): void {
    const r0 = this.row[i], c0 = this.col[i];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
      fn(r * this.cols + c);
    }
  }

  /** Does place i touch the road or the reachable empty space (any of its 8 neighbours)? */
  private touchesAccess(i: number): boolean {
    let ok = false;
    this.each8(i, (sl) => {
      if (ok) return;
      if (this.road[sl]) { ok = true; return; }
      const k = this.slot[sl];
      if (k >= 0 && this.color[k] < 0 && this.reach[k]) ok = true;
    });
    return ok;
  }

  /** Spread the reachable region from empty place i through empty places, 8-connected (diagonals across corners allowed). */
  private flood(i: number): void {
    if (this.reach[i] || this.color[i] >= 0) return;
    this.reach[i] = 1;
    const queue = [i];
    for (let qi = 0; qi < queue.length; qi++) {
      this.each8(queue[qi], (sl) => {
        const k = this.slot[sl];
        if (k < 0 || this.reach[k] || this.color[k] >= 0) return;
        this.reach[k] = 1;
        queue.push(k);
      });
    }
  }

  /** Recompute the reachable empty region from scratch: empty places touching the road, then everything joined to them. */
  rebuildReach(): void {
    this.reach.fill(0);
    for (let i = 0; i < this.n; i++) {
      if (this.color[i] >= 0 || this.reach[i]) continue;
      let src = false;
      this.each8(i, (sl) => { if (this.road[sl]) src = true; });
      if (src) this.flood(i);
    }
  }

  /** A passenger a bus can collect: still there, not crated, with an access neighbour. */
  boardable(i: number): boolean {
    return this.color[i] >= 0 && !this.crate[i] && !this.reserved[i] && this.touchesAccess(i);
  }

  /** Release place i (its passenger has started boarding) and grow the access region through it. */
  private release(i: number): void {
    const k = this.keyOf[i];
    if (k >= 0) {
      this.keyOf[i] = -1;
      const b = this.buses[k];
      if (b && b.locked) { b.locked = false; this.unlockQ.push({ bus: k, cell: i }); }
    }
    this.remove(i);
    if (this.touchesAccess(i)) this.flood(i);
  }

  // ------------------------------------------------------------ the crowd

  /** Everyone with a free place ahead of them (towards the road) steps into it, nearest the road first. */
  private settle(ev: SimEvent[]): void {
    let moved = 0;
    for (const from of this.order) {
      if (this.color[from] < 0 || this.reserved[from]) continue;
      let to = -1;
      for (const k of this.steps[from]) if (this.color[k] < 0) { to = k; break; }
      if (to < 0) continue;
      this.color[to] = this.color[from];
      this.ice[to] = this.ice[from];
      this.crate[to] = this.crate[from];
      this.keyOf[to] = this.keyOf[from];
      this.color[from] = EMPTY;
      this.ice[from] = 0;
      this.crate[from] = 0;
      this.keyOf[from] = -1;
      ev.push({ t: 'move', from, to });
      moved++;
    }
    this.lastMoves = moved;
  }

  private remove(i: number): void {
    this.keyOf[i] = -1;
    this.color[i] = EMPTY;
    this.ice[i] = 0;
    this.crate[i] = 0;
  }

  /** Marks people with nobody standing right in front of (below) them: their bodies show. */
  frontFlags(out: Uint8Array): void {
    for (let i = 0; i < this.n; i++) {
      if (this.color[i] < 0) { out[i] = 0; continue; }
      const a = this.below[i * 2], b = this.below[i * 2 + 1];
      out[i] = (a >= 0 && this.color[a] >= 0) || (b >= 0 && this.color[b] >= 0) ? 0 : 1;
    }
  }

  // ------------------------------------------------------------ buses

  get lapLen(): number { return this.pts.length; }
  totalUnits(): number { return this.units.reduce((a, b) => a + b, 0); }
  onRoad(): SimBus[] { return this.buses.filter((b) => b.where === 'road' || b.where === 'enter'); }
  freeSlots(): number { return this.slots - this.onRoad().length; }
  fronts(): SimBus[] { return this.columns.filter((c) => c.length).map((c) => this.buses[c[0]]); }
  inLot(): SimBus[] { return this.buses.filter((b) => b.where === 'lot'); }
  won(): boolean { return this.totalUnits() === 0; }
  colOf(id: number): number { return this.columns.findIndex((c) => c.includes(id)); }
  isFront(id: number): boolean { return this.columns.some((c) => c[0] === id); }

  private reveal(): void {
    for (const c of this.columns) if (c.length) this.buses[c[0]].hidden = false;
  }

  canTap(id: number): 'ok' | 'free' | 'full' | 'notFront' | 'linked' | 'locked' | 'frozen' {
    const b = this.buses[id];
    if (b.where !== 'lot' || !this.isFront(id)) return 'notFront';
    if (b.locked) return 'locked';
    if (b.frozen > 0) return 'frozen';
    if (b.link >= 0 && !this.isFront(b.link)) return 'linked';
    const need = b.link >= 0 ? 2 : 1;
    if (this.units[b.color] === 0 && (b.link < 0 || this.units[this.buses[b.link].color] === 0)) return 'free';
    return this.freeSlots() >= need ? 'ok' : 'full';
  }

  private takeFromLot(id: number): void {
    const c = this.colOf(id);
    if (c >= 0) this.columns[c].splice(this.columns[c].indexOf(id), 1);
  }

  private send(b: SimBus, ev: SimEvent[]): void {
    if (b.keyBus) { b.keyBus = false; this.keys++; ev.push({ t: 'key', bus: b.id }); }
    // every bus that leaves the lot melts the frozen ones a little
    b.frozen = 0;
    for (const o of this.buses) {
      if (o.where !== 'lot' || o.frozen <= 0 || o === b) continue;
      if (--o.frozen === 0) { ev.push({ t: 'thaw', bus: o.id }); this.doomT = 0; }
    }
    if (this.units[b.color] === 0) {
      b.where = 'gone';
      ev.push({ t: 'done', bus: b.id, free: true });
      return;
    }
    b.where = 'enter';
    b.enterT = ENTER_TICKS;
    b.dry = 0;
    b.steps = 0;
    ev.push({ t: 'enter', bus: b.id });
  }

  /** Tap a parked front bus (its roped partner goes too). */
  tap(id: number): SimEvent[] | null {
    const st = this.canTap(id);
    if (st !== 'ok' && st !== 'free') return null;
    const ev: SimEvent[] = [];
    const b = this.buses[id];
    b.col = this.colOf(id);
    this.takeFromLot(id);
    this.send(b, ev);
    if (b.link >= 0) {
      const o = this.buses[b.link];
      o.col = this.colOf(o.id);
      this.takeFromLot(o.id);
      this.send(o, ev);
    }
    this.reveal();
    this.useKeys(ev);
    return ev;
  }

  /** A padlocked bus at the front of its line takes a collected key and opens. */
  private useKeys(ev: SimEvent[]): void {
    for (const c of this.columns) {
      if (this.keys <= 0) return;
      const b = c.length ? this.buses[c[0]] : null;
      if (!b || !b.locked) continue;
      b.locked = false;
      this.keys--;
      this.doomT = 0;
      ev.push({ t: 'unlock', bus: b.id, cell: -1 });
    }
  }

  /** Booster: send ANY parked bus (its rope is cut). */
  pick(id: number): SimEvent[] | null {
    const b = this.buses[id];
    if (b.where !== 'lot') return null;
    if (this.units[b.color] > 0 && this.freeSlots() < 1) return null;
    if (b.link >= 0) { this.buses[b.link].link = -1; b.link = -1; }
    b.hidden = false;
    // the magnet lifts a padlocked bus too: its key is no longer needed
    if (b.locked) { b.locked = false; for (let i = 0; i < this.n; i++) if (this.keyOf[i] === id) this.keyOf[i] = -1; }
    b.col = this.colOf(id);
    const ev: SimEvent[] = [];
    this.takeFromLot(id);
    this.send(b, ev);
    this.reveal();
    this.useKeys(ev);
    return ev;
  }

  /** Booster: the parked buses without a rope swap places at random. */
  shuffleLot(rnd: () => number): boolean {
    const free = this.inLot().filter((b) => b.link < 0).map((b) => b.id);
    if (free.length < 2) return false;
    const spots = free.map((id) => { const c = this.colOf(id); return [c, this.columns[c].indexOf(id)] as const; });
    const ids = [...free];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    spots.forEach(([c, k], i) => { this.columns[c][k] = ids[i]; });
    this.reveal();
    return true;
  }

  /** Is place i on the side of the road bus point q serves (not across the stem)? */
  private serves(q: PathPt, i: number): boolean {
    const g = this.geo;
    // the stem this point of the road climbs (the nearest)
    const st = g.stems.reduce((a, b) => (Math.abs(b.cx - q.x) < Math.abs(a.cx - q.x) ? b : a));
    if (q.y <= st.cyU || q.y > g.H) return true; // round the stem's top and along the bar: one side only anyway
    if (Math.abs(q.x - st.cx) < 0.01) return true;
    return Math.sign(this.x[i] - st.cx) === Math.sign(q.x - st.cx) || this.y[i] > g.H;
  }

  /**
   * One tick of a bus's boarding state machine:
   * SEARCH_SEED → (seed with road access found) SEED_CONFIRMED → RADIUS_ACTIVE
   * (centre frozen at the bus) → GROUP_RESERVED → RADIUS_OFF → BOARDING_ANIMATION
   * (BOARD_TICKS) → UPDATE_GRID (places released) → SEARCH_SEED.
   * Returns whether anything changed.
   */
  private board(b: SimBus, at: number, ev: SimEvent[]): boolean {
    let changed = false;
    if (b.phase === 'boarding') {
      b.busy = true;
      if (--b.boardT <= 0) {
        // the group is aboard (their places were freed when they were picked)
        b.group = [];
        b.seed = -1;
        b.phase = 'search';
        changed = true;
      }
    }
    if (b.cap <= 0) return changed;
    const q = this.pts[at];
    // Seeds. A passenger of its colour standing right against the road is taken by
    // default whenever the bus has a seat — even while an earlier group is still
    // boarding — and each one opens the radius again. Otherwise (searching) the best
    // passenger with road access through empty places is the seed.
    const seeds: number[] = [];
    for (const i of this.near[at]) {
      if (this.color[i] === b.color && !this.crate[i] && this.serves(q, i) && this.touchesRoad(i)) seeds.push(i);
    }
    if (!seeds.length && b.phase === 'search') {
      for (const i of this.near[at]) {
        if (this.color[i] === b.color && this.serves(q, i) && this.boardable(i)) { seeds.push(i); break; }
      }
    }
    if (!seeds.length) return changed; // radius stays off
    // RADIUS_ACTIVE: centred on the bus where it stands now
    b.cx = q.x;
    b.cy = q.y;
    const rush = this.rushOn();
    const radius = this.boardRadius * (rush ? 2 : 1);
    const r2 = radius * radius;
    const taken = new Set<number>();
    const group: number[] = [];
    const take = (i: number): void => { if (!taken.has(i) && group.length < b.cap) { taken.add(i); group.push(i); } };
    for (const seed of seeds) {
      if (group.length >= b.cap) break;
      take(seed);
      // the radius opens for this seed: everyone of its colour round the bus, nearest first
      const extra: number[] = [];
      // the normal radius lies inside this road point's collecting zone: only those places can
      // join (the final rush's doubled radius scans everyone)
      const pool: ArrayLike<number> = rush || radius > this.zoneR ? this.allPlaces : this.near[at];
      for (let k = 0; k < pool.length; k++) {
        const i = pool[k];
        if (taken.has(i) || this.color[i] !== b.color || this.crate[i]) continue;
        const dx = this.x[i] - b.cx, dy = this.y[i] - b.cy;
        if (dx * dx + dy * dy > r2 || !this.serves(q, i)) continue;
        extra.push(i);
      }
      extra.sort((i, j) => {
        const di = Math.hypot(this.x[i] - b.cx, this.y[i] - b.cy), dj = Math.hypot(this.x[j] - b.cx, this.y[j] - b.cy);
        return Math.round(di * 100) - Math.round(dj * 100) || this.row[i] - this.row[j] || this.col[i] - this.col[j];
      });
      for (const i of extra) take(i);
    }
    // GROUP_RESERVED: seeds first, then the nearest, never past the seats left
    for (const i of group) {
      b.cap--;
      this.units[b.color]--;
      if (this.ice[i] > 0) {
        // ice cracks: one unit taken, the passenger stays put
        this.ice[i]--;
        ev.push({ t: 'take', bus: b.id, cell: i, color: b.color, ice: true });
        continue;
      }
      // their place frees at once: the crowd behind closes up while they head for the bus
      b.group.push(i);
      ev.push({ t: 'take', bus: b.id, cell: i, color: b.color, ice: false });
      this.release(i);
    }
    // RADIUS_OFF → BOARDING_ANIMATION (longer if this group joins one still boarding)
    b.seed = seeds[0];
    b.dry = 0;
    b.busy = true;
    // a big group (over STREAM) streams in faster: it takes no longer than STREAM passengers would
    const stream = Math.min(group.length, STREAM) * BOARD_STAGGER;
    const t = Math.ceil((BOARD_TICKS + stream) / (rush ? 2 : 1));
    b.boardT = b.phase === 'boarding' ? Math.max(b.boardT, 0) + Math.ceil(stream / (rush ? 2 : 1)) : t;
    b.phase = 'boarding';
    return true;
  }

  /** Is place i right against the road (one of its 8 neighbouring slots is road)? */
  touchesRoad(i: number): boolean {
    let ok = false;
    this.each8(i, (sl) => { if (this.road[sl]) ok = true; });
    return ok;
  }


  private finish(b: SimBus, ev: SimEvent[]): void {
    b.group = [];
    b.phase = 'search';
    // full: no more crawling past the crowd, it heads for the way out at cruising speed
    b.busy = false;
    // a bus on the road drives on to the way out in its place in the line; one still entering just goes
    if (b.where === 'road') {
      b.where = 'exit';
      b.exitLeft = (this.exitAt - Math.floor(b.pos) + this.pts.length) % this.pts.length;
    } else b.where = 'gone';
    ev.push({ t: 'done', bus: b.id, free: false });
  }

  /** Where full buses leave the loop: its left end, by the gate lane. */
  private get exitAt(): number {
    if (this.exitAtCache < 0) {
      let bx = Infinity;
      this.pts.forEach((p, i) => { if (p.x < bx) { bx = p.x; this.exitAtCache = i; } });
    }
    return this.exitAtCache;
  }
  private exitAtCache = -1;

  step(): SimEvent[] {
    const ev: SimEvent[] = [];
    this.ticks++;
    const L = this.pts.length;
    let changed = false;
    // move: the bus furthest ahead first, each one stopping short of the one in front (no overtaking)
    // every bus on the tarmac keeps its distance, the full ones on their way out included
    const moving = this.buses.filter((b) => b.where === 'road' || b.where === 'exit');
    for (const b of moving) {
      b.pos0 = b.pos;
      b.v += ((b.busy ? CRAWL : CRUISE) - b.v) * 0.35;
    }
    for (const b of moving) {
      let ahead = Infinity;
      for (const o of moving) if (o !== b) { const d = (o.pos - b.pos + L) % L; if (d > 0 && d < ahead) ahead = d; }
      const step = Math.max(0, Math.min(b.v, ahead - this.spacing));
      b.pos = (b.pos + step) % L;
      if (b.where === 'exit') {
        b.exitLeft = (b.exitLeft ?? 0) - step;
        if (b.exitLeft <= 0) { b.where = 'gone'; ev.push({ t: 'exited', bus: b.id }); }
      }
    }
    const road = this.buses.filter((b) => b.where === 'road');
    for (const b of road) {
      b.steps++;
      b.dry++;
      b.busy = false;
      const at = Math.floor(b.pos) % L;
      const zone = this.near[at];
      if (!zone.length) continue;
      // a crate in the zone with access gets knocked by the passing bus
      for (const i of this.curb[at]) {
        if (this.crate[i] > 0 && this.color[i] >= 0 && this.touchesAccess(i)) {
          this.crate[i]--;
          ev.push({ t: 'crate', cell: i, left: this.crate[i] });
          changed = true;
          break;
        }
      }
      if (this.board(b, at, ev)) changed = true;
    }
    void changed;
    this.flushUnlocks(ev);
    this.useKeys(ev);
    this.settle(ev);
    this.rebuildReach();
    // checked every tick: one hopeless lap in a row loses the round
    this.doomT = this.hopeless() ? this.doomT + 1 : 0;
    // three of a colour on the road become one
    for (let c = 0; c < COLOR_KEYS.length; c++) {
      const same = this.buses.filter((b) => b.where === 'road' && b.color === c && b.cap > 0);
      if (same.length < 3) continue;
      same.sort((a, z) => z.steps - a.steps);
      const [lead, a, z] = same;
      lead.cap += a.cap + z.cap;
      lead.merged = true;
      for (const o of [a, z]) { o.group = []; o.phase = 'search'; o.where = 'gone'; o.cap = 0; }
      ev.push({ t: 'merge', bus: lead.id, absorbed: [a.id, z.id] });
    }
    // a bus whose seats are all taken is done at once (its last passengers are still flying in);
    // one whose colour has run out leaves once the group it has is aboard
    for (const b of this.buses) if ((b.where === 'road' || b.where === 'enter') && (b.cap <= 0 || (this.units[b.color] === 0 && b.phase !== 'boarding'))) this.finish(b, ev);
    for (const b of this.buses) {
      if (b.where !== 'enter') continue;
      if (--b.enterT > 0) continue;
      const e = this.entries[Math.max(0, b.col)];
      const busy = this.buses.some((o) => (o.where === 'road' || o.where === 'exit') && Math.min((o.pos - e + L) % L, (e - o.pos + L) % L) < Math.max(GAP, this.spacing + 1));
      if (busy) continue;
      b.where = 'road';
      b.pos = e;
      b.pos0 = e;
      b.v = CRUISE;
      b.dry = 0;
    }
    return ev;
  }

  anyTap(): boolean {
    return this.fronts().some((f) => { const s = this.canTap(f.id); return s === 'ok' || s === 'free'; });
  }

  /**
   * Lost: the round has been hopeless (see hopeless()) for one whole lap of the
   * road, counted from the moment it became so; any change on the way (a pickup,
   * a passenger sliding into reach, a bus leaving, a revive) starts the count over.
   */
  stuck(): boolean {
    return this.doomT >= this.pts.length;
  }

  /**
   * No way forward right now: nothing can be tapped (the road's slots are full,
   * or the lot is empty), no bus is entering or boarding a group, the crowd is at
   * rest, and no bus on the road has a passenger of its colour it could still pick
   * up anywhere on its loop (one standing in a collecting zone with access to the
   * road; one under a crate counts only where passing buses knock crates, right
   * by the road).
   */
  hopeless(): boolean {
    if (this.won() || this.lastMoves > 0) return false;
    const road = this.onRoad();
    if (road.some((b) => b.where === 'enter' || b.phase === 'boarding' || b.cap <= 0 || this.units[b.color] === 0)) return false;
    if (this.anyTap()) return false;
    // a full road counts as jammed even while + could still open a slot: the player gets
    // one lap to tap it (the + flashes), then the revive card comes up
    const want = new Uint8Array(COLOR_KEYS.length);
    for (const b of road) want[b.color] = 1;
    for (let i = 0; i < this.n; i++) {
      const c = this.color[i];
      if (c < 0 || !want[c] || !this.inZone[i] || this.reserved[i]) continue;
      // under a crate: only if a passing bus can knock it (right by the road)
      if (this.crate[i] > 0 && !this.inCurb[i]) continue;
      if (this.touchesAccess(i)) return false;
    }
    return true;
  }

  /** Per colour: boardable passengers inside some bus's collecting zone. */
  exposure(): number[] {
    const out = new Array(COLOR_KEYS.length).fill(0);
    const seen = new Uint8Array(this.n);
    for (const list of this.near) for (const i of list) {
      if (seen[i]) continue;
      seen[i] = 1;
      if (this.boardable(i)) out[this.color[i]]++;
    }
    return out;
  }

  /** Broom: the people against the road's walls go — crates break, ice melts. */
  sweep(): SimEvent[] {
    const ev: SimEvent[] = [];
    const wall = [...new Set(this.curb.flatMap((c) => [...c]))].sort((i, j) => this.y[j] - this.y[i]);
    for (const i of wall) {
      const color = this.color[i];
      if (color < 0 || !this.touchesAccess(i)) continue;
      if (this.crate[i] > 0) { this.crate[i] = 0; ev.push({ t: 'sweep', cell: i, what: 'crate', color }); continue; }
      if (this.ice[i] > 0) { this.ice[i] = 0; this.units[color]--; ev.push({ t: 'sweep', cell: i, what: 'ice', color }); continue; }
      this.units[color]--;
      ev.push({ t: 'sweep', cell: i, what: 'ball', color });
      this.release(i);
    }
    this.flushUnlocks(ev);
    this.settle(ev);
    this.rebuildReach();
    for (const b of this.buses) { b.dry = 0; if ((b.where === 'road' || b.where === 'enter') && this.units[b.color] === 0) this.finish(b, ev); }
    this.doomT = 0;
    return ev;
  }

  private flushUnlocks(ev: SimEvent[]): void {
    for (const u of this.unlockQ) ev.push({ t: 'unlock', bus: u.bus, cell: u.cell });
    if (this.unlockQ.length) this.doomT = 0;
    this.unlockQ.length = 0;
  }

  /**
   * Boosters: bus `id` (parked or on the road) fills up at once with passengers of its colour
   * from the board, nearest the road first. A parked bus leaves the lot for good (its key, if
   * it carries one, is collected, and the frozen ones thaw a step, as for any departure); a bus
   * on the road drives off full. Returns the take events, or null when it cannot apply.
   */
  fillBus(id: number): SimEvent[] | null {
    const b = this.buses[id];
    if (!b || (b.where !== 'lot' && b.where !== 'road' && b.where !== 'enter') || b.cap <= 0) return null;
    const ev: SimEvent[] = [];
    if (b.where === 'lot') {
      if (b.link >= 0) { this.buses[b.link].link = -1; b.link = -1; }
      b.hidden = false; b.locked = false; b.frozen = 0;
      b.col = this.colOf(id);
      this.takeFromLot(id);
      if (b.keyBus) { b.keyBus = false; this.keys++; ev.push({ t: 'key', bus: b.id }); }
      for (const o of this.buses) if (o.where === 'lot' && o.frozen > 0 && --o.frozen === 0) ev.push({ t: 'thaw', bus: o.id });
    }
    const cands: number[] = [];
    for (let i = 0; i < this.n; i++) if (this.color[i] === b.color && !this.reserved[i] && !this.crate[i]) cands.push(i);
    cands.sort((i, j) => this.y[j] - this.y[i]);
    for (const i of cands) {
      if (b.cap <= 0) break;
      const units = 1 + this.ice[i];
      b.cap = Math.max(0, b.cap - units);
      this.units[b.color] -= units;
      ev.push({ t: 'take', bus: b.id, cell: i, color: b.color, ice: false });
      this.release(i);
    }
    b.cap = 0; b.phase = 'search'; b.group = [];
    if (b.where === 'lot') b.where = 'gone';
    this.reveal();
    this.useKeys(ev);
    this.flushUnlocks(ev);
    this.settle(ev);
    this.rebuildReach();
    for (const o of this.buses) o.dry = 0;
    this.doomT = 0;
    return ev;
  }

  /**
   * Revive: every bus on the road fills up at once with passengers of its colour from anywhere
   * on the board (nearest the road first), then drives off full. Returns the take events.
   */
  reviveFill(): SimEvent[] {
    const ev: SimEvent[] = [];
    for (const b of this.buses) {
      if ((b.where !== 'road' && b.where !== 'enter') || b.cap <= 0) continue;
      const cands: number[] = [];
      for (let i = 0; i < this.n; i++) if (this.color[i] === b.color && !this.reserved[i] && !this.crate[i]) cands.push(i);
      cands.sort((i, j) => this.y[j] - this.y[i]);
      for (const i of cands) {
        if (b.cap <= 0) break;
        // every unit of the passenger (ice layers too) goes aboard
        const units = 1 + this.ice[i];
        b.cap = Math.max(0, b.cap - units);
        this.units[b.color] -= units;
        ev.push({ t: 'take', bus: b.id, cell: i, color: b.color, ice: false });
        this.release(i);
      }
      b.cap = 0;
      b.phase = 'search';
      b.group = [];
    }
    this.flushUnlocks(ev);
    this.settle(ev);
    this.rebuildReach();
    for (const b of this.buses) b.dry = 0;
    this.doomT = 0;
    return ev;
  }

  addSlot(): void { this.slots++; this.doomT = 0; for (const b of this.buses) b.dry = 0; }

  progress(total: number): number { return Math.round((1 - this.totalUnits() / Math.max(1, total)) * 100); }

  /**
   * The order colours come into reach if six buses that take anything rode the
   * loop (one entry per unit). Null if the board cannot empty. Mutates.
   */
  /** The place behind each unit of the last oracle() run (the same order as its colours). */
  oraclePlaces: number[] = [];

  oracle(): number[] | null {
    const out: number[] = [];
    this.oraclePlaces = [];
    const ev: SimEvent[] = [];
    const L = this.pts.length;
    const riders = Array.from({ length: 6 }, (_, k) => Math.floor((k * L) / 6));
    let idle = 0;
    while (this.totalUnits() > 0) {
      if (++idle > L * 2) return null;
      for (let k = 0; k < riders.length; k++) {
        riders[k] = (riders[k] + 1) % L;
        let n = 0;
        while (n < TAKE) {
          let pick = -1;
          for (const i of this.near[riders[k]]) if (this.color[i] >= 0 && this.touchesAccess(i)) { pick = i; break; }
          if (pick < 0) break;
          n++;
          idle = 0;
          if (this.crate[pick] > 0) { this.crate[pick]--; continue; }
          const col = this.color[pick];
          out.push(col);
          this.oraclePlaces.push(pick);
          this.units[col]--;
          if (this.ice[pick] > 0) this.ice[pick]--;
          else this.release(pick);
        }
      }
      this.settle(ev);
      this.rebuildReach();
      ev.length = 0;
    }
    return out;
  }
}

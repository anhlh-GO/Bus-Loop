// Bus Loop — a marble picture above, a parking lot of cars below (a remake of
// the reference video's layout and rules). Tap the front car of a column: it
// drives onto the road that loops anticlockwise round the lot and up into the
// picture, and takes the marbles of its colour nearest to it; the marbles
// behind (and the mixed pile waiting above the screen) roll down towards the
// road. A full car gets a tick and leaves down the exit lane by the barrier.
// Three cars of one colour on the road merge into one big bus (more decks for
// more load). The road holds a few cars at once; when every car on a full road
// laps with nothing left to take, the round is lost.
//
// The rules live in sim.ts (shared with the tuning bot); this file draws, animates
// and drives them. The `FalconGame` object at the bottom is how the studio layer
// (and Falcon IDE) drives the game.

import FalconSDK from '@falcongames/game-client-sdk';
import { createFalconEvents, type FalconGame } from './falcon-game';
import { LEVEL_COUNT, MAX_SLOTS, UNLOCK, backdrop, botPick, getLevel, mulberry32, themeOf, type Theme } from './levels';
import { PICTURES } from './pictures';
import { COLOR_KEYS, ENTER_TICKS, SHIFT, Sim, roadDist, tierOf, type LevelSpec, type SimEvent } from './sim';
import {
  FONT, HEX, INK, PERSON_W, PERSON_X0, ballSprite, personSprite, barrier, cactus, clearBusCache, drawKey, drawPadlock, snowTree, bush, cloud, drawBus, drawCrate, drawDog, drawIce, drawMascot,
  drawPicture, insetShadow, outlinedText, raised, roofOffset, roundRect, rrPath, trafficLight, tree,
} from './art';
import { audio, haptic, sfx, unlockAudio } from './audio';
import homeUrl from './assets/home.jpg';
import albumUrl from './assets/collection.jpg';
import loadingUrl from './assets/loading.jpg';
import settingsUrl from './assets/settings.jpg';
import bBroomUrl from './assets/b_broom.png';
import bShuffleUrl from './assets/b_shuffle.png';
import bMagnetUrl from './assets/b_magnet.png';
import {
  boosterIcon, roundBooster, dialog, iconTile, infoBox, inside, levelPill, pillButton, popupCard, ribbon, roundButton, slotPill,
  speedButton, toast, type BoosterKey, type Rect,
} from './ui';

export { LEVEL_COUNT };

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const events = createFalconEvents();

interface Pt { x: number; y: number }
interface VBus {
  id: number;
  x: number; y: number; head: number;
  popT: number;
  shakeT: number;
  enterFrom: Pt | null;
  enterT: number;
  leaveT: number;
  absorbInto: number;
  absorbT: number;
  absorbFrom: Pt | null;
  revealT: number;
  wasHidden: boolean;
  /** A full bus's way out: round the loop, down the gate lane, off screen (px), and how far along it is. */
  exit: Pt[] | null;
  exitD: number;
  /** Clear booster: the bus lifts from the lot to the top of the road and draws its passengers in (t s). */
  vac?: { t: number; from: Pt; to: Pt; out: number };
}
/** A passenger on their way to a bus; t < 0 while still waiting their turn (they stay in their place). */
interface Flight { color: number; bus: number; cell: number; x0: number; y0: number; t: number; dur: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; t: number; color: string; size: number; kind: 'dot' | 'confetti' | 'ball' | 'shard' | 'star'; rot: number; ball: number }
interface Floater { text: string; x: number; y: number; t: number; life: number; size: number; color: string; stroke: string }

const TICK = 1 / 20;
const FLY = 0.3;
const MAX_REVIVES = 2;
const UP = -Math.PI / 2;

let level = 0;
let spec: LevelSpec = getLevel(0);
let sim = new Sim(spec);
let total = sim.totalUnits();
let vb = new Map<number, VBus>();
let flights: Flight[] = [];
let particles: Particle[] = [];
let floaters: Floater[] = [];
let tickAcc = 0;
/** DEV timing (ms, summed): the sim, the crowd, the buses, frames. */
const perf: { sim: number; crowd: number; buses: number; frames: number; layouts?: number; starts?: number } = { sim: 0, crowd: 0, buses: 0, frames: 0 };
/** Game speed: the button toggles ×1 / ×2 ("Speed" / "Speeding"); the last six buses always run at ×2. */
const SPEEDS = [1, 2];
let speedIdx = 0;
const boosted = (): boolean => sim.rushOn() && state === 'playing';
const speedMul = (): number => Math.max(SPEEDS[speedIdx], boosted() ? 2 : 1);
let combo = 0;
let comboT = 0;
/** Marbles collected this round (the orange counter), and when it last ticked up. */
let collected = 0;
let collectedT = -9;
/** Little emoji faces that pop up on the pile while cars collect. */
interface Emoji { x: number; y: number; t: number; kind: number }
let emojis: Emoji[] = [];
let emojiT = 0;
/** How far between the last tick and the next we are (for smooth drawing). */
let frac = 0;

let state: 'playing' | 'won' | 'lost' | 'over' = 'over';
let paused = false;
let clock = 0;
let endT = 0;
let winT = 0;
let revives = 0;
let lightT = -9;
let fullFlash = -9;
let devPrompt: { text: string; next: number } | null = null;
let toastMsg = '';
let toastT = 0;
let armed: BoosterKey | null = null;

/** Overlays: at most one at a time. */
type Overlay =
  | { kind: 'revive'; t: number; busy: boolean }
  | { kind: 'fail'; t: number }
  | { kind: 'intro'; t: number; what: IntroKey }
  | { kind: 'home'; t: number }
  | { kind: 'settings'; t: number; from: 'home' | 'game'; confirm: number }
  | { kind: 'loading'; t: number }
  | { kind: 'album'; t: number; scroll: number; from: 'home' | 'game' }
  | { kind: 'win'; t: number }
  | { kind: 'hard'; t: number; tier: 'hard' | 'super' };
/** An intro card waiting behind the hard-level banner. */
let pendingIntro: IntroKey | null = null;
/** Keys flying from the passenger who carried them to the bus they unlock. */
let keyFlights: { bus: number; x0: number; y0: number; t: number; toHud: boolean }[] = [];
/** Where the key counter sits (right end of the road's median). */
let keyHud: Pt = { x: 0, y: 0 };
let overlay: Overlay | null = null;
let buttons: { id: string; r: Rect }[] = [];

/** Tutorial: L1 0 = tap a bus, 1 = it collects; L2 2 = send three of a colour, 3 = merged; -1 = none. */
let tutorial = -1;
let tutorT = 0;

/**
 * Coach steps: the mascot's line plus a pointing hand on what it talks about
 * (a bus, a frozen passenger, a crate, a booster…). A step ends after `dur`
 * seconds or on the player's next tap (which still does what it does).
 */
interface CoachStep { text: string; at: () => Pt | null; dur: number }
let coach: CoachStep[] = [];
/** How long the road has been full with a bus waiting (for the + hint). */
let fullT = 0;
/** The home screen's picture. */
const homeImg = new Image();
homeImg.src = homeUrl;
/** The booster buttons cut from the reference (sizes in the cut's own pixels: width, circle centre, badge centre). */
const boosterImg = (url: string): HTMLImageElement => { const im = new Image(); im.src = url; return im; };
const BOOSTER_ART: Record<string, { img: HTMLImageElement; w0: number; cx: number; cy: number; bx: number; by: number }> = {
  broom: { img: boosterImg(bBroomUrl), w0: 503, cx: 245, cy: 246, bx: 407, by: 395 },
  shuffle: { img: boosterImg(bShuffleUrl), w0: 518, cx: 245, cy: 246, bx: 422, by: 395 },
  magnet: { img: boosterImg(bMagnetUrl), w0: 514, cx: 245, cy: 246, bx: 418, by: 395 },
};
const loadingImg = boosterImg(loadingUrl);
const settingsImg = boosterImg(settingsUrl);
const albumImg = new Image();
albumImg.src = albumUrl;
/** Coins won (40 a level) and the current win streak, kept in the save. */
/** The app's first startLevel shows the home screen first; what it covers comes after Play. */
let firstStart = true;
let afterHome: Overlay | null = null;
let coins = 0;
let streak = 0;

/** The + lesson: the hand on the road counter's +, the first time the player gets stuck on a full road. */
function slotHint(): void {
  if (seenIntros.includes('slotHint') || coach.length || tutorial >= 0 || armed) return;
  seenIntros.push('slotHint');
  FalconSDK.userData.set({ intros: [...seenIntros] });
  coach = [{ text: 'The road is full! Tap + to open one more slot for free, up to 8 buses!', at: () => ({ x: slotPlus.x + slotPlus.w / 2, y: slotPlus.y + slotPlus.h / 2 }), dur: 8 }];
  coachT = 0;
}

/**
 * The opening of every level: the passengers stream in from further out and
 * close up towards the U into the level's picture. ~2.6 s; the rules stand still
 * and input is locked until it is done. Waits behind an intro card.
 */
const GATHER = 2.6;
let gatherT = GATHER;
/** Per place (board units): where its passenger starts from, relative to its place; its delay and travel time (s). */
let gdx = new Float32Array(0), gdy = new Float32Array(0), gdel = new Float32Array(0), gdur = new Float32Array(0);
const gathering = (): boolean => gatherT < GATHER;

/** The hard-level banner goes: the waiting intro card (if any) comes next, else the level opens. */
function closeHard(): void {
  overlay = pendingIntro ? { kind: 'intro', t: 0, what: pendingIntro } : null;
  pendingIntro = null;
}

function startGather(): void {
  const n = sim.n, g = sim.geo;
  gdx = new Float32Array(n); gdy = new Float32Array(n); gdel = new Float32Array(n); gdur = new Float32Array(n);
  // they close in on the U: from the stem's top, outwards
  const cx = g.cx, cy = g.stemTop;
  for (let i = 0; i < n; i++) {
    const dx = sim.x[i] - cx, dy = sim.y[i] - cy;
    const d = Math.hypot(dx, dy) || 1;
    const out = 5 + Math.random() * 7;
    gdx[i] = (dx / d) * out + (Math.random() - 0.5) * 2;
    gdy[i] = (dy / d) * out + (Math.random() - 0.5) * 2;
    // the ones nearest the road settle first, the far ones stream in behind them
    gdel[i] = Math.min(0.9, d * 0.02) + Math.random() * 0.3;
    gdur[i] = 1.1 + Math.random() * 0.5;
  }
  gatherT = 0;
}
let coachT = 0;
/** Booster lessons on levels with nothing else new (1-based level → booster). */
const BOOSTER_LESSON: Partial<Record<number, BoosterKey>> = { 5: 'broom', 7: 'magnet', 9: 'shuffle' };

type IntroKey = 'hidden' | 'ice' | 'tunnel' | 'lock' | 'frozen' | 'link' | BoosterKey;
/** The bar of the reference: Clear (broom), Shuffle, Magnet — all there from the start. */
const BOOSTERS: { key: BoosterKey; label: string; unlock: number }[] = [
  { key: 'broom', label: 'Clear', unlock: 1 },
  { key: 'shuffle', label: 'Shuffle', unlock: 1 },
  { key: 'magnet', label: 'Magnet', unlock: 1 },
];
/** +Slot lives on the road's counter, not in the bar. */
const SLOT_UNLOCK = 2;
/** Starting units, as in the reference: one Clear, one Magnet, Shuffle for a rewarded ad. */
const BOOSTER_START: Record<BoosterKey, number> = { broom: 3, shuffle: 3, magnet: 3, slot: 3 };
/** An empty booster refills for free with this many. */
const BOOSTER_REFILL = 3;
const boosterCounts: Record<BoosterKey, number> = { ...BOOSTER_START };
const boosterPress: Partial<Record<BoosterKey, number>> = {};
let boosterSpots: { key: BoosterKey; x: number; y: number; r: number }[] = [];
let album: number[] = [];
let seenIntros: string[] = [];

// ---------------------------------------------------------------- layout

const L = {
  w: 0, h: 0, dpr: 1, u: 0, cw: 0, cx0: 0, top: 0,
  hudY: 0, hudH: 0, homeX: 0, homeY: 0, homeR: 0,
  ox: 0, oy: 0, cs: 0, bw: 0,
  speedX: 0, speedY: 0, speedR: 0,
  boosterY: 0, boosterR: 0,
};
/** The road's outline (CSS px), for drawing the road over the crowd. */
let roadClip: Path2D | null = null;
/** The scene cut down to the road (see layout). */
let roadLayer: HTMLCanvasElement | null = null;
/** The pockets inside hollow stems: cut out of roadClip (they are ground, with passengers). */
let roadHole: Path2D | null = null;
let scene: HTMLCanvasElement | null = null;
let header: HTMLCanvasElement | null = null;
let slotPlus: Rect = { x: 0, y: 0, w: 0, h: 0 };
const safeProbe = document.createElement('div');
safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:max(var(--sbh, 0px), env(safe-area-inset-top, 0px));padding-bottom:env(safe-area-inset-bottom, 0px)';
document.body.appendChild(safeProbe);

/** Cell units → screen px. */
const px = (x: number, y: number): Pt => ({ x: L.ox + x * L.cs, y: L.oy + y * L.cs });
/** Where marble k is drawn now (between its last two physics positions). */
/** People stepping into a new place glide there from the old one: offset still to cover (place units). */
let offX = new Float32Array(0), offY = new Float32Array(0);
const sliding = new Set<number>();
/** Where marble k is drawn now: its place, plus what is left of the glide into it. */
const cellPx = (k: number): Pt => px(sim.x[k] + (offX[k] || 0), sim.y[k] + (offY[k] || 0));

/** Glide every moving marble towards its place at a steady pace (a diagonal step in about 0.07 s). */
function glide(dt: number): void {
  const step = 15 * dt * speedMul();
  for (const k of sliding) {
    const d = Math.hypot(offX[k], offY[k]);
    if (d <= step) { offX[k] = 0; offY[k] = 0; sliding.delete(k); continue; }
    offX[k] -= (offX[k] / d) * step;
    offY[k] -= (offY[k] / d) * step;
  }
}

function layout(): void {
  perf.layouts = (perf.layouts ?? 0) + 1;
  clearBusCache();
  // capped at 2: a 3x phone canvas costs 2.25x the pixels to paint for no visible gain
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  L.w = w;
  L.h = h;
  if (w < 1 || h < 1) { scene = null; return; }
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const cs0 = getComputedStyle(safeProbe);
  const sbh = parseFloat(cs0.paddingTop) || 0, sbb = parseFloat(cs0.paddingBottom) || 0;
  // One phone-shaped column, centred (desktop preview keeps a portrait phone's proportions).
  const cw = Math.min(w, h * 0.5), cx0 = (w - cw) / 2;
  const u = Math.min(cw, h * 0.55);
  const geo = sim.geo;
  // As in the reference: the board's visible part starts right under the cream
  // ledge, edge to edge, and the lot runs on down to the bottom (about four and
  // a half rows); the rest of the board waits above the screen.
  const top = cw * 0.06;
  const need = geo.vis + (geo.row0 - geo.H) + geo.rowH * 3.9;
  // the board runs a little past both screen edges, so the crowd touches them as in the reference
  const cs = Math.max(3, Math.min(cw / (spec.W - 0.6), (h - sbb - top) / need));
  const ox = cx0 + (cw - spec.W * cs) / 2, oy = top - (geo.H - geo.vis) * cs;
  const boosterR = u * 0.078;
  // the HUD row (settings, level pill, counter) sits just under the status bar, over the board
  const hudH = u * 0.058, hudC = Math.max(sbh, u * 0.12) + u * 0.052;
  Object.assign(L, {
    dpr, u, cw, cx0, top, hudY: hudC - hudH / 2, hudH, homeR: u * 0.06, homeX: cx0 + u * 0.071, homeY: hudC + u * 0.006,
    ox, oy, cs, bw: geo.bw * cs,
    speedX: px(geo.laneX, 0).x, speedY: oy + (geo.row0 + geo.rowH * 0.82) * cs, speedR: u * 0.052,
    boosterY: h - sbb - boosterR * 1.75, boosterR,
  });

  scene = document.createElement('canvas');
  scene.width = canvas.width;
  scene.height = canvas.height;
  const g = scene.getContext('2d')!;
  g.scale(dpr, dpr);
  paintScene(g, w, h);
  // the road and its curbs, cut out once: drawn over the crowd every frame (passengers beside it tuck behind the curb)
  roadLayer = document.createElement('canvas');
  roadLayer.width = scene.width;
  roadLayer.height = scene.height;
  const rl = roadLayer.getContext('2d')!;
  rl.drawImage(scene, 0, 0);
  rl.scale(dpr, dpr);
  rl.globalCompositeOperation = 'destination-in';
  if (roadClip) rl.fill(roadClip);
  rl.globalCompositeOperation = 'destination-out';
  if (roadHole) rl.fill(roadHole);
  header = document.createElement('canvas');
  header.width = canvas.width;
  header.height = Math.ceil(cw * 0.22 * dpr);
  const hg = header.getContext('2d')!;
  hg.scale(dpr, dpr);
  paintHeader(hg, w);
  for (const b of vb.values()) {
    const s = sim.buses[b.id];
    if (s.where === 'lot') { const p = lotPos(b.id); b.x = p.x; b.y = p.y; }
  }
}

/** Each theme's colours: ground, the raised slab, curbs, road surface, the median groove, bays, the bottom bar, the header ledge. */
const PAL: Record<Theme, {
  ground: string; rim: [string, string]; rimSide: string; curbTop: [string, string]; curbMid: string; curbIn: string;
  surf: [string, string]; surfShadow: string; groove: [string, string]; grooveRim: string; lane: string; bay: string;
  bar: [string, string]; ledgeTop: [string, string]; ledgeFace: [string, string]; deco: 'tree' | 'cactus' | 'snow' | 'pumpkin';
}> = {
  lavender: {
    ground: '#c3b1af', rim: ['#fbfaf4', '#ebe9de'], rimSide: '#c4c2d6', curbTop: ['#ffffff', '#f1f0f7'], curbMid: '#e6e6f2', curbIn: '#c9c8de',
    surf: ['#aab1de', '#9fa6d6'], surfShadow: 'rgba(50, 45, 110, 0.5)', groove: ['#676d92', '#575d84'], grooveRim: '#fbfbff', lane: '#4f5784', bay: '#8b92c0',
    bar: ['#1b3f9e', '#06195f'], ledgeTop: ['#fff3e4', '#f6dcc0'], ledgeFace: ['#ecc9a5', '#ddb48c'], deco: 'tree',
  },
  // the newer reference video: warm sand, an orange frame, cactuses
  sand: {
    ground: '#fbd89a', rim: ['#fff4df', '#f6e2bf'], rimSide: '#e3b77c', curbTop: ['#fff8ea', '#fdf0d8'], curbMid: '#f9e3bd', curbIn: '#efc890',
    surf: ['#ffd08a', '#f9c27a'], surfShadow: 'rgba(150, 90, 20, 0.45)', groove: ['#dca060', '#cf9152'], grooveRim: '#fff3dc', lane: '#c98a48', bay: '#f2b56a',
    bar: ['#e08a2e', '#a85a12'], ledgeTop: ['#ffe2b0', '#ffc77a'], ledgeFace: ['#f6a54c', '#e48a2e'], deco: 'cactus',
  },
  mint: {
    ground: '#a9d98c', rim: ['#f6fbf2', '#e3f0dc'], rimSide: '#b5d3b0', curbTop: ['#ffffff', '#f0f8f2'], curbMid: '#ddefe4', curbIn: '#b9dcc8',
    surf: ['#bfe7dd', '#acdcd1'], surfShadow: 'rgba(30, 90, 80, 0.45)', groove: ['#5aa093', '#4a8a7f'], grooveRim: '#fbfffd', lane: '#467f75', bay: '#93cbbe',
    bar: ['#2e8a5a', '#145a36'], ledgeTop: ['#f4fff0', '#dff3d6'], ledgeFace: ['#bfe3b0', '#a6d397'], deco: 'tree',
  },
  // Halloween night: a deep purple ground, an orange-rimmed dusky road, pumpkins by the road
  halloween: {
    ground: '#3a2660', rim: ['#ffd9a3', '#f6b45f'], rimSide: '#b8641f', curbTop: ['#ffe8c4', '#ffd49a'], curbMid: '#f7b867', curbIn: '#d8873a',
    surf: ['#6c5a9e', '#5d4b8e'], surfShadow: 'rgba(20, 10, 50, 0.55)', groove: ['#2c1d4d', '#24173f'], grooveRim: '#ffc978', lane: '#2c1d4d', bay: '#4d3d80',
    bar: ['#ff8a1e', '#b35400'], ledgeTop: ['#ffb45a', '#f08a1e'], ledgeFace: ['#7a3cc2', '#5a2896'], deco: 'pumpkin',
  },
  snow: {
    ground: '#e8f3fb', rim: ['#ffffff', '#eef5fb'], rimSide: '#c2d3e6', curbTop: ['#ffffff', '#f4f8fd'], curbMid: '#e2ecf7', curbIn: '#c6d6ea',
    surf: ['#c3d7f2', '#b2c9ec'], surfShadow: 'rgba(40, 70, 130, 0.45)', groove: ['#6e8ec4', '#5b7ab0'], grooveRim: '#ffffff', lane: '#58739f', bay: '#a5bde3',
    bar: ['#3a6fb8', '#1a3f80'], ledgeTop: ['#ffffff', '#eef6ff'], ledgeFace: ['#cfe0f2', '#b9cfe8'], deco: 'snow',
  },
};
const pal = () => PAL[themeOf(level)];

/** A glowing jack-o'-lantern by the road (the Halloween look). */
function pumpkinDeco(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const glow = g.createRadialGradient(x, y, 0, x, y, s * 1.4);
  glow.addColorStop(0, 'rgba(255, 170, 60, 0.45)'); glow.addColorStop(1, 'rgba(255, 140, 30, 0)');
  g.fillStyle = glow; g.beginPath(); g.arc(x, y, s * 1.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a2a0a';
  g.beginPath(); g.ellipse(x, y, s * 0.62, s * 0.5, 0, 0, Math.PI * 2); g.fill();
  const b = g.createRadialGradient(x - s * 0.2, y - s * 0.2, s * 0.05, x, y, s * 0.6);
  b.addColorStop(0, '#ffb347'); b.addColorStop(1, '#e8650a');
  g.fillStyle = b;
  for (const dx of [-0.28, 0, 0.28]) { g.beginPath(); g.ellipse(x + dx * s, y, s * 0.3, s * 0.46, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#3b7a1e'; g.fillRect(x - s * 0.05, y - s * 0.62, s * 0.1, s * 0.16);
  g.fillStyle = '#ffe36a';
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(x + sx * s * 0.28, y - s * 0.16); g.lineTo(x + sx * s * 0.14, y - s * 0.02); g.lineTo(x + sx * s * 0.38, y - s * 0.02); g.closePath(); g.fill(); }
  g.beginPath(); g.moveTo(x - s * 0.34, y + s * 0.1); g.quadraticCurveTo(x, y + s * 0.42, x + s * 0.34, y + s * 0.1); g.quadraticCurveTo(x, y + s * 0.22, x - s * 0.34, y + s * 0.1); g.fill();
}

function paintScene(g: CanvasRenderingContext2D, w: number, h: number): void {
  const { cs, u, dpr } = L;
  const geo = sim.geo;
  const { W, H, stemTop, lw, m, ym, xL, xR, lotL, lotR, rc, lotTop, laneX, cyU, stems } = geo;
  const T = pal();
  // the ground round everything (the picture's floor too, once its marbles have gone)
  g.fillStyle = T.ground;
  g.fillRect(0, 0, w, h);
  const P = (x: number, y: number, ww: number, hh: number, r: number, path = new Path2D()): Path2D => {
    const a = px(x, y);
    rrPath(path, a.x, a.y, ww * cs, hh * cs, r * cs);
    return path;
  };
  const far = H + 300;
  void W;
  // round green bushes peeking in at the screen's edges beside the lot
  for (const [fx, fy] of [[lotL - 2.2, 0.02], [lotR + 2.2, 0.0], [lotR + 2.2, 0.42], [lotL - 2.2, 0.5]] as const) {
    const p = px(fx, lotTop + (h / cs - lotTop) * fy * 0.7);
    if (T.deco === 'cactus') cactus(g, p.x, p.y, u * 0.08);
    else if (T.deco === 'pumpkin') pumpkinDeco(g, p.x, p.y, u * 0.07);
    else if (T.deco === 'snow') snowTree(g, p.x, p.y, u * 0.075);
    else tree(g, p.x, p.y, u * 0.075);
  }
  // the road + lot: a lavender toy slab with a thick cream border, moulded in one piece
  const top = H + geo.g;
  // a band (polyline + half-width) as a chain of capsules, all wound the same way so they union
  const band = (b: { pts: [number, number][]; hw: number }, inset: number, dy: number, path: Path2D): void => {
    const r = (b.hw - inset) * cs;
    if (r <= 0) return;
    const q = b.pts.map(([x, y]) => px(x, y + dy));
    for (let i = 0; i < q.length; i++) {
      path.moveTo(q[i].x + r, q[i].y);
      path.arc(q[i].x, q[i].y, r, 0, Math.PI * 2);
      if (i === 0) continue;
      const a = q[i - 1], c = q[i], d = Math.hypot(c.x - a.x, c.y - a.y);
      if (d < 0.01) continue;
      const nx = (-(c.y - a.y) / d) * r, ny = ((c.x - a.x) / d) * r;
      let poly = [[a.x + nx, a.y + ny], [c.x + nx, c.y + ny], [c.x - nx, c.y - ny], [a.x - nx, a.y - ny]];
      let area = 0;
      for (let k = 0; k < 4; k++) area += poly[k][0] * poly[(k + 1) % 4][1] - poly[(k + 1) % 4][0] * poly[k][1];
      if (area < 0) poly = poly.reverse();
      path.moveTo(poly[0][0], poly[0][1]);
      for (let k = 1; k < 4; k++) path.lineTo(poly[k][0], poly[k][1]);
      path.closePath();
    }
  };
  const roadShape = (inset: number, dy = 0): Path2D => {
    const path = P(lotL + inset, top + inset + dy, lotR - lotL - inset * 2, far, rc - inset);
    for (const b of geo.bodies) band(b, inset, dy, path);
    return path;
  };
  raised(g, roadShape(-0.1), cs * 0.55, T.rim, T.rimSide, px(0, stemTop).y, px(0, lotTop + 6).y, 'rgba(70, 60, 110, 0.4)');
  // the road with its curbs is drawn again over the crowd (see drawPlay): passengers beside it tuck behind the curb
  roadClip = roadShape(-0.12);
  // a hollow stem's pocket: ground inside the ring of road, passengers stand there too
  const pockets = geo.pockets.map((pk) => P(pk.cx - pk.hw, pk.ty, pk.hw * 2, ym - m / 2 - 0.6 - pk.ty, Math.max(0.6, pk.rr)));
  roadHole = null;
  if (pockets.length) { roadHole = new Path2D(); for (const pk of pockets) roadHole.addPath(pk); }
  // a thick raised curb, as in the reference: a white top a cell wide, then its inner
  // wall (seen along the far edges, the road surface sitting a little lower)
  const curbTop = g.createLinearGradient(0, px(0, stemTop).y, 0, px(0, lotTop + 6).y);
  curbTop.addColorStop(0, T.curbTop[0]);
  curbTop.addColorStop(1, T.curbTop[1]);
  g.fillStyle = curbTop;
  g.fill(roadShape(0.12));
  // the curb's rounded profile: white along the outside, shading to lavender-grey on the inside
  g.fillStyle = T.curbMid;
  g.fill(roadShape(0.45));
  g.fillStyle = T.curbIn;
  g.fill(roadShape(0.72));
  const surface = roadShape(0.9, 0.3);
  const sf = g.createLinearGradient(0, px(0, stemTop).y, 0, h);
  sf.addColorStop(0, T.surf[0]);
  sf.addColorStop(1, T.surf[1]);
  g.fillStyle = sf;
  g.fill(surface);
  insetShadow(g, surface, dpr, cs * 0.9, cs * 0.45, T.surfShadow);
  // the groove: a dark blue-grey channel down the stem and along the median, with a thick raised white rim
  const med = P(xL - m / 2, ym - m / 2, xR - xL + m, m, m / 2);
  for (const b of geo.medians) band(b, 0, 0, med);
  // the pockets: the ground again, rimmed by a raised curb
  for (const pk of pockets) {
    g.fillStyle = T.ground;
    g.fill(pk);
    insetShadow(g, pk, dpr, cs * 0.8, cs * 0.5, 'rgba(60, 40, 20, 0.35)');
    g.save();
    g.shadowColor = 'rgba(40, 40, 90, 0.35)';
    g.shadowBlur = cs * 0.6;
    g.shadowOffsetY = cs * 0.25;
    g.strokeStyle = T.curbIn;
    g.lineWidth = cs * 1.3;
    g.stroke(pk);
    g.restore();
    g.strokeStyle = T.curbTop[0];
    g.lineWidth = cs * 0.9;
    g.stroke(pk);
  }
  g.save();
  g.shadowColor = 'rgba(40, 40, 90, 0.45)';
  g.shadowBlur = cs * 0.8;
  g.shadowOffsetY = cs * 0.35;
  g.strokeStyle = T.curbIn;
  g.lineWidth = cs * 1.35;
  g.stroke(med);
  g.restore();
  g.save();
  g.translate(0, -cs * 0.2);
  g.strokeStyle = T.grooveRim;
  g.lineWidth = cs * 1.2;
  g.stroke(med);
  g.restore();
  const mg = g.createLinearGradient(0, px(0, cyU).y, 0, px(0, ym + m).y);
  mg.addColorStop(0, T.groove[0]);
  mg.addColorStop(1, T.groove[1]);
  g.fillStyle = mg;
  g.fill(med);
  insetShadow(g, med, dpr, cs * 0.6, cs * 0.45, 'rgba(10, 10, 40, 0.65)');
  // the exit lane down the lot's left side, split from the parking by a dark groove with a white rim
  const divX = laneX + lw * 0.66;
  const lane = P(divX - lw * 0.17, lotTop + 1.6, lw * 0.34, far, lw * 0.17);
  g.save();
  g.shadowColor = 'rgba(40, 40, 90, 0.4)';
  g.shadowBlur = cs * 0.6;
  g.shadowOffsetY = cs * 0.25;
  g.strokeStyle = T.grooveRim;
  g.lineWidth = cs * 1.0;
  g.stroke(lane);
  g.restore();
  g.fillStyle = T.lane;
  g.fill(lane);
  insetShadow(g, lane, dpr, cs * 0.4, cs * 0.3, 'rgba(10, 10, 40, 0.6)');
  // the parking bays of the front row (they show once their column is empty)
  for (const cx of geo.colX) {
    const bay = P(cx - geo.bw * 0.58, geo.row0 - geo.rowH * 0.5, geo.bw * 1.16, geo.rowH * 0.95, geo.bw * 0.22);
    g.fillStyle = T.bay;
    g.fill(bay);
    insetShadow(g, bay, dpr, cs * 0.5, cs * 0.25, 'rgba(30, 30, 80, 0.45)');
  }
  // the blue bar along the bottom edge
  const bb = g.createLinearGradient(0, h - u * 0.035, 0, h);
  bb.addColorStop(0, T.bar[0]);
  bb.addColorStop(1, T.bar[1]);
  g.fillStyle = bb;
  g.fillRect(0, h - u * 0.03, w, u * 0.03);
}

/**
 * The top of the screen as in the reference: a strip of sky and garden behind
 * a thick cream ledge that arches up in the middle (a lit top face, a darker
 * front face, a soft shadow on the marbles), and the puppy peeking over it
 * with its paws on the ledge.
 */
function paintHeader(g: CanvasRenderingContext2D, w: number): void {
  const { cw, cx0 } = L;
  // the ledge's top edge and its two lower edges, by x (arched: highest in the middle)
  const arc = (x: number, y0: number, dip: number): number => { const f = (x - cx0) / cw * 2 - 1; return cw * (y0 + dip * f * f); };
  const topY = (x: number): number => arc(x, 0.016, 0.056);
  const midY = (x: number): number => arc(x, 0.044, 0.05);
  const botY = (x: number): number => arc(x, 0.07, 0.046);
  const band = (fa: (x: number) => number, fb: (x: number) => number, dy = 0): void => {
    g.beginPath();
    g.moveTo(0, fa(0) + dy);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, fa(x) + dy);
    g.lineTo(w, fa(w) + dy);
    for (let x = w; x >= 0; x -= 4) g.lineTo(x, fb(x) + dy);
    g.lineTo(0, fb(0) + dy);
    g.closePath();
  };
  // everything stays inside the phone column (a wide preview shows ground either side)
  g.save();
  g.beginPath(); g.rect(cx0, 0, cw, cw); g.clip();
  // sky
  const sky = g.createLinearGradient(0, 0, 0, cw * 0.15);
  const night = themeOf(level) === 'halloween';
  sky.addColorStop(0, night ? '#1d1546' : '#6cbcfc');
  sky.addColorStop(1, night ? '#4a2f86' : '#a2d2fb');
  g.fillStyle = sky;
  band(() => 0, (x) => midY(x));
  g.fill();
  // the garden behind the ledge: round bushes with pink flowers
  const shrub = (x: number, y: number, s: number): void => {
    for (const [dx, dy, r, c] of [[-0.55, 0.1, 0.42, '#7cc23e'], [0.5, 0.12, 0.4, '#7cc23e'], [0, -0.05, 0.55, '#9ad64b'], [-0.25, -0.2, 0.32, '#b4e35c']] as const) {
      g.fillStyle = c;
      g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill();
    }
    for (const [dx, dy] of [[0.25, -0.05], [-0.6, 0.2]] as const) {
      const fx = x + dx * s, fy = y + dy * s, pr = s * 0.11;
      g.fillStyle = '#ff9fb4';
      for (let k = 0; k < 5; k++) { const a0 = (k / 5) * Math.PI * 2; g.beginPath(); g.arc(fx + Math.cos(a0) * pr, fy + Math.sin(a0) * pr, pr * 0.75, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#ffe27a';
      g.beginPath(); g.arc(fx, fy, pr * 0.55, 0, Math.PI * 2); g.fill();
    }
  };
  shrub(cx0 + cw * 0.07, topY(cx0 + cw * 0.07) - cw * 0.012, cw * 0.075);
  shrub(cx0 + cw * 0.8, topY(cx0 + cw * 0.8) - cw * 0.01, cw * 0.06);
  // the puppy behind the ledge (its paws go on after)
  // its shadow on the marbles
  g.save();
  g.filter = `blur(${Math.max(1, cw * 0.008)}px)`;
  g.fillStyle = 'rgba(70, 60, 120, 0.28)';
  band((x) => botY(x) - cw * 0.01, (x) => botY(x) + cw * 0.016);
  g.fill();
  g.restore();
  // front face, then the lit top face
  const face = g.createLinearGradient(0, cw * 0.06, 0, cw * 0.15);
  face.addColorStop(0, pal().ledgeFace[0]);
  face.addColorStop(1, pal().ledgeFace[1]);
  g.fillStyle = face;
  band(midY, botY);
  g.fill();
  const lit = g.createLinearGradient(0, cw * 0.03, 0, cw * 0.12);
  lit.addColorStop(0, pal().ledgeTop[0]);
  lit.addColorStop(1, pal().ledgeTop[1]);
  g.fillStyle = lit;
  band(topY, midY);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = Math.max(1, cw * 0.004);
  g.beginPath();
  for (let x = 0; x <= w; x += 4) { const y = topY(x) + cw * 0.003; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke();
  g.restore();
}

function lotPos(id: number): Pt {
  const c = sim.colOf(id);
  const k = c >= 0 ? sim.columns[c].indexOf(id) : 0;
  const geo = sim.geo;
  return px(geo.colX[Math.max(0, c)], geo.row0 + k * geo.rowH);
}

/** Where a bus is on the loop right now: between its last two positions, on a continuous road coordinate. */
function roadPose(pos0: number, pos: number, frac: number): { x: number; y: number; head: number } {
  const pts = sim.pts, n = pts.length;
  const at = (pos0 + ((pos - pos0 + n) % n) * frac) % n;
  const i = Math.floor(at), f = at - i;
  const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
  const p = px(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
  const h1 = Math.atan2(b.y - a.y, b.x - a.x), h2 = Math.atan2(c.y - b.y, c.x - b.x);
  return { x: p.x, y: p.y, head: lerpAngle(h1, h2, f) };
}

/** A full car's way out from road point `pos`: on round the loop to its far left (heading down), then down the exit lane. */
function exitRoute(pos: number): Pt[] {
  const pts = sim.pts, n = pts.length, g = sim.geo;
  let end = 0, bx = Infinity;
  pts.forEach((p, i) => { if (p.x < bx) { bx = p.x; end = i; } });
  const out: Pt[] = [];
  for (let k = pos; ; k = (k + 1) % n) {
    out.push(px(pts[k].x, pts[k].y));
    if (k === end || out.length > n) break;
  }
  out.push(px(g.laneX, g.ym + g.lw * 0.6));
  out.push(px(g.laneX, g.lotTop + 1.6));
  out.push({ x: px(g.laneX, 0).x, y: L.h + L.bw * 3 });
  return out;
}

/** The point `d` px along a polyline, its heading, and whether it is on the gate lane (the last two legs). */
function alongPx(path: Pt[], d: number): Pt & { ang: number; done: boolean; lane: boolean } {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= seg || i === path.length - 1) {
      const e = seg ? Math.min(1, d / seg) : 1;
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, ang: Math.atan2(b.y - a.y, b.x - a.x), done: d >= seg && i === path.length - 1, lane: i >= path.length - 2 };
    }
    d -= seg;
  }
  const z = path[path.length - 1];
  return { ...z, ang: Math.PI / 2, done: true, lane: true };
}

/** The green tick on a full bus's roof. */
function checkBadge(x: number, y: number, r: number): void {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r * 1.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2fbf4a';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.32;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x - r * 0.45, y); ctx.lineTo(x - r * 0.1, y + r * 0.38); ctx.lineTo(x + r * 0.5, y - r * 0.35); ctx.stroke();
}

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// ---------------------------------------------------------------- level

function startLevel(index: number): void {
  perf.starts = (perf.starts ?? 0) + 1;
  level = Math.max(0, Math.min(LEVEL_COUNT - 1, Math.floor(index)));
  spec = getLevel(level);
  sim = new Sim(spec);
  total = sim.totalUnits();
  vb = new Map();
  offX = new Float32Array(sim.n);
  offY = new Float32Array(sim.n);
  sliding.clear();
  for (const b of sim.buses) {
    vb.set(b.id, { id: b.id, x: 0, y: 0, head: UP, popT: -9, shakeT: -9, enterFrom: null, enterT: 0, leaveT: -1, absorbInto: -1, absorbT: 0, absorbFrom: null, revealT: -9, wasHidden: b.hidden, exit: null, exitD: 0 });
  }
  flights = [];
  particles = [];
  floaters = [];
  emojis = [];
  emojiT = 0;
  collected = 0;
  tickAcc = 0;
  combo = 0;
  state = 'playing';
  paused = false;
  endT = 0;
  winT = 0;
  revives = 0;
  armed = null;
  devPrompt = null;
  overlay = null;
  toastT = 0;
  loadSave();
  layout();
  for (const b of vb.values()) { b.y -= L.bw * 0.6; b.popT = clock + Math.max(0, sim.columns[Math.max(0, sim.colOf(b.id))].indexOf(b.id)) * 0.05; }
  tutorial = level === 0 ? 0 : level === 1 ? 2 : -1;
  tutorT = 0;
  coach = [];
  coachT = 0;
  // A new blocker or booster gets an intro card first.
  const n = level + 1;
  const intro: IntroKey | undefined = (Object.keys(UNLOCK) as (keyof typeof UNLOCK)[]).find((k) => UNLOCK[k] === n)
    ?? BOOSTER_LESSON[n];
  pendingIntro = intro && !seenIntros.includes(intro) ? intro : null;
  keyFlights = [];
  // hard and super-hard levels announce themselves first; an intro card follows the banner
  if (spec.difficulty === 'hard' || spec.difficulty === 'super') overlay = { kind: 'hard', t: 0, tier: spec.difficulty };
  else if (pendingIntro) { overlay = { kind: 'intro', t: 0, what: pendingIntro }; pendingIntro = null; }
  // the very first start (app launch) opens on the home screen; the level's own card waits behind it
  if (firstStart) { firstStart = false; afterHome = overlay; overlay = { kind: 'home', t: 0 }; } else afterHome = null;
  startGather();
  // Fire when the board is READY to play — the studio layer starts the level's clock here.
  events.emit('levelStart', { index: level, difficulty: spec.difficulty === 'super' ? 'hard' : spec.difficulty, levelId: `bus-${level + 1}` });
}

const winPics = new Map<string, HTMLCanvasElement>();

/**
 * The finished picture for the clear screen, as the board showed it: the level's
 * 40 × 40 grid of glossy 2.5D marbles packed tight (odd rows a little to the
 * right, lower rows overlapping the ones above), the picture placed exactly as
 * the level places it, on its own background colour. Cached per level and size.
 */
function winPicture(i: number, size: number): HTMLCanvasElement {
  const px = Math.max(16, Math.round(size * L.dpr));
  const key = `${i}:${px}`;
  let c = winPics.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const pic = PICTURES[i % PICTURES.length];
  let rows = pic.rows;
  const { bg, to } = backdrop(rows);
  const keyOf = (k: string): number => COLOR_KEYS.indexOf(k === bg ? to : k);
  // the object cropped out of its backdrop (a scene stays whole) and centred, a cell of margin round it
  if (!pic.scene && !pic.full) {
    let t = rows.length, b = -1, l = rows[0].length, rgt = -1;
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== bg) { t = Math.min(t, y); b = Math.max(b, y); l = Math.min(l, x); rgt = Math.max(rgt, x); } });
    if (b >= t) rows = rows.slice(t, b + 1).map((row) => row.slice(l, rgt + 1));
  }
  const N = 40, pw = rows[0].length, ph = rows.length;
  const room = pic.scene || pic.full ? N : N - 4;
  const sc = Math.min(room / pw, room / ph);
  const x0 = (N - pw * sc) / 2, r0 = (N - ph * sc) / 2;
  const cell = px / (N + SHIFT);
  const d = Math.round(cell * 1.14);
  for (let r = 0; r < N; r++) {
    for (let col = 0; col < N; col++) {
      const x = col + 0.5 + (r & 1) * SHIFT;
      const pc = Math.floor((x - 0.25 - x0) / sc), pr = Math.floor((r - r0) / sc);
      const k = pc >= 0 && pc < pw && pr >= 0 && pr < ph ? keyOf(rows[pr][pc]) : keyOf(bg);
      if (k < 0) continue;
      g.drawImage(ballSprite(k, d), x * cell - d / 2, (r + 0.5) * cell + (px - N * cell) / 2 - d / 2, d, d);
    }
  }
  winPics.set(key, c);
  return c;
}

/** A picture as the board shows it (its background swapped to green when it has no green of its own). */
function shownRows(i: number): string[] {
  const rows = PICTURES[i % PICTURES.length].rows;
  const { bg, to } = backdrop(rows);
  return bg === to ? rows : rows.map((r) => r.split(bg).join(to));
}

const canPlay = (): boolean => state === 'playing' && !paused && !overlay && !gathering() && !FalconSDK.pause.isPaused();

// ---------------------------------------------------------------- effects

function float(text: string, x: number, y: number, size: number, color = '#fff36b', stroke = INK, life = 1.1): void {
  floaters.push({ text, x, y, t: 0, life, size, color, stroke });
}

function burst(x: number, y: number, color: string, n: number, speed: number, size: number, kind: Particle['kind'] = 'dot'): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45 + Math.random() * 0.35, t: 0, color, size: size * (0.6 + Math.random() * 0.6), kind, rot: Math.random() * 6, ball: 0 });
  }
}

function confetti(): void {
  const cols = ['#ff3b3b', '#ffd21f', '#3cc93c', '#22c8f0', '#a98bff', '#ff7ac8'];
  for (let i = 0; i < 90; i++) {
    particles.push({
      x: L.cx0 + Math.random() * L.cw, y: -20 - Math.random() * L.h * 0.3, vx: (Math.random() - 0.5) * 80, vy: 160 + Math.random() * 200,
      life: 2.6 + Math.random(), t: 0, color: cols[i % cols.length], size: L.u * (0.012 + Math.random() * 0.01), kind: 'confetti', rot: Math.random() * 6, ball: 0,
    });
  }
}

function showToast(msg: string): void {
  toastMsg = msg;
  toastT = 1.8;
}

const busPos = (id: number): Pt => { const b = vb.get(id)!; return { x: b.x, y: b.y }; };
const busTiers = (id: number): number => tierOf(sim.buses[id]);
/** Where marbles fly to: the bus's roof. */
const roofPos = (id: number): Pt => { const b = vb.get(id)!; return { x: b.x, y: b.y + roofOffset(L.bw, busTiers(id)) }; };

function apply(ev: SimEvent[]): void {
  for (const e of ev) {
    if (e.t === 'move') {
      offX[e.to] = offX[e.from] + sim.x[e.from] - sim.x[e.to];
      offY[e.to] = offY[e.from] + sim.y[e.from] - sim.y[e.to];
      offX[e.from] = 0;
      offY[e.from] = 0;
      sliding.delete(e.from);
      sliding.add(e.to);
    } else if (e.t === 'take') {
      const p = cellPx(e.cell);
      if (e.ice) {
        burst(p.x, p.y, '#dff4ff', 5, L.u * 0.2, L.cs * 0.35, 'shard');
        sfx.crack();
      }
      // picked passengers set off for the bus at once (a few hundredths of a second apart, so
      // a crowd does not move as one block) and fly straight to where the bus is now: no queue
      // behind the rest of the group, so a big group never chases a bus already far away
      const roof = roofPos(e.bus);
      const dist = Math.hypot(roof.x - p.x, roof.y - p.y);
      const wait = Math.random() * 0.12 / speedMul();
      const dur = Math.min(0.55, 0.25 + dist / (L.cs * 60)) * (0.9 + Math.random() * 0.2) / speedMul();
      // the place itself frees at once (others close up); the passenger steps out from where they stood
      flights.push({ color: e.color, bus: e.bus, cell: -1, x0: p.x, y0: p.y, t: -wait, dur });
      if (emojiT <= 0 && emojis.length < 3 && Math.random() < 0.08) {
        emojis.push({ x: p.x + (Math.random() - 0.5) * L.cs * 6, y: p.y - L.cs * (2 + Math.random() * 4), t: 0, kind: Math.floor(Math.random() * 3) });
        emojiT = 1.2;
      }
      offX[e.cell] = 0;
      offY[e.cell] = 0;
      sliding.delete(e.cell);
    } else if (e.t === 'crate') {
      const p = cellPx(e.cell);
      burst(p.x, p.y, '#d08a3a', e.left ? 4 : 9, L.u * 0.25, L.cs * 0.5, 'shard');
      sfx.crate();
    } else if (e.t === 'exited') {
      const b = vb.get(e.bus)!;
      b.exit = exitRoute(Math.floor(sim.buses[e.bus].pos) % sim.pts.length);
      b.exitD = 0;
    } else if (e.t === 'done') {
      const b = vb.get(e.bus)!;
      b.leaveT = 0;
      if (e.free) float('Free ride!', b.x, b.y - L.bw, L.u * 0.045, '#ffffff', '#16842a');
      // a full bus on the road drives on in the line (sim 'exit') and takes the gate lane at the loop's end
      else if (sim.buses[e.bus].where !== 'exit') b.exit = exitRoute(Math.floor(sim.buses[e.bus].pos) % sim.pts.length);
      if (!e.free && sim.buses[e.bus].where === 'exit') b.leaveT = -1;
      b.exitD = 0;
      burst(b.x, b.y - L.bw * 0.4, '#9ff07a', 10, L.u * 0.3, L.u * 0.012);
      sfx.depart();
      if (sim.won() && state === 'playing') { state = 'won'; winT = 0; }
    } else if (e.t === 'enter') {
      const b = vb.get(e.bus)!;
      b.enterFrom = { x: b.x, y: b.y };
      b.enterT = 0;
      b.popT = clock;
      // a little puff of dust under the wheels as it pulls out
      for (let k = 0; k < 8; k++) {
        const a = Math.PI * (0.15 + 0.7 * Math.random());
        particles.push({ x: b.x + (Math.random() - 0.5) * L.bw, y: b.y + L.bw * 0.5, vx: Math.cos(a) * L.u * 0.15 * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * L.u * 0.05, life: 0.45, t: 0, color: 'rgba(255,255,255,0.9)', size: L.bw * 0.22, kind: 'dot', rot: 0, ball: 0 });
      }
      sfx.drive();
    } else if (e.t === 'merge') {
      const b = vb.get(e.bus)!;
      for (const id of e.absorbed) {
        const o = vb.get(id)!;
        o.absorbInto = e.bus;
        o.absorbT = 0;
        o.absorbFrom = { x: o.x, y: o.y };
      }
      b.popT = clock + 0.32;
      const tiers = busTiers(e.bus);
      float(tiers >= 3 ? 'Triple-Decker!' : tiers === 2 ? 'Double-Decker!' : 'Merged!', b.x, b.y - L.bw * 1.4, L.u * 0.055, '#fff36b', '#7a3a00', 1.4);
      sfx.merge();
      haptic(25);
      if (tutorial === 2) { tutorial = 3; tutorT = 0; }
    } else if (e.t === 'unlock') {
      // a collected key flies from the counter to the padlocked bus now at the front
      const p = e.cell >= 0 ? cellPx(e.cell) : keyHud;
      keyFlights.push({ bus: e.bus, x0: p.x, y0: p.y, t: e.cell >= 0 ? 0 : -0.25, toHud: false });
    } else if (e.t === 'thaw') {
      const b = vb.get(e.bus)!;
      b.popT = clock;
      burst(b.x, b.y - L.bw * 0.3, '#dff4ff', 14, L.u * 0.3, L.cs * 0.5, 'shard');
      float('Thawed!', b.x, b.y - L.bw * 1.3, L.u * 0.05, '#ffffff', '#1f6fd6', 1.1);
      sfx.crack();
    } else if (e.t === 'key') {
      // the key on a departing bus's roof flies to the counter
      const b = vb.get(e.bus)!;
      keyFlights.push({ bus: e.bus, x0: b.x, y0: b.y + roofOffset(L.bw, 1) - L.bw * 0.4, t: 0, toHud: true });
      sfx.booster();
    } else if (e.t === 'sweep') {
      const p = cellPx(e.cell);
      if (e.what === 'crate') burst(p.x, p.y, '#d08a3a', 8, L.u * 0.3, L.cs * 0.5, 'shard');
      else if (e.what === 'ice') burst(p.x, p.y, '#dff4ff', 6, L.u * 0.3, L.cs * 0.4, 'shard');
      else {
        particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * L.u * 0.6, vy: -L.u * (0.3 + Math.random() * 0.4), life: 0.8, t: 0, color: HEX[e.color], size: L.cs * 1.1, kind: 'ball', rot: 0, ball: e.color });
        collected++;
        collectedT = clock;
      }
    }
  }
}

// ---------------------------------------------------------------- input: buses

function tapBus(id: number): void {
  if (!canPlay()) return;
  const s = sim.buses[id];
  if (s.where !== 'lot') return;
  if (armed === 'broom') { clearBus(id); return; }
  if (armed === 'magnet') { showToast('Pick a bus on the road!'); return; }
  const st = sim.canTap(id);
  const b = vb.get(id)!;
  if (st === 'notFront') {
    b.shakeT = clock;
    sfx.bump();
    return;
  }
  if (st === 'linked') {
    b.shakeT = clock;
    vb.get(s.link)!.shakeT = clock;
    sfx.honk();
    showToast('Roped buses leave together!');
    return;
  }
  if (st === 'frozen') {
    b.shakeT = clock;
    sfx.bump();
    showToast(`Frozen! Send out ${s.frozen} more bus${s.frozen > 1 ? 'es' : ''} to melt it`);
    return;
  }
  if (st === 'locked') {
    b.shakeT = clock;
    sfx.bump();
    showToast('Locked! Send out a bus with a key to open it');
    return;
  }
  if (st === 'full') {
    b.shakeT = clock;
    fullFlash = clock;
    sfx.honk();
    if (sim.slots < MAX_SLOTS && level + 1 >= SLOT_UNLOCK) slotHint();
    showToast(sim.slots < MAX_SLOTS ? 'Road full: tap + for one more slot!' : s.link >= 0 ? 'Roped buses need 2 free slots!' : 'The road is full!');
    return;
  }
  const ev = sim.tap(id);
  if (!ev) return;
  haptic(12);
  apply(ev);
  if (tutorial === 0) {
    tutorial = -1;
    coach = [
      { text: 'It drives round the loop and picks up every passenger of its colour it passes!', at: () => (sim.buses[id].where === 'road' || sim.buses[id].where === 'enter' ? busPos(id) : null), dur: 4 },
      { text: `${sim.slots} buses can drive at once: this counter shows how many are out. A full road can jam!`, at: () => ({ x: slotPlus.x - L.u * 0.12, y: slotPlus.y + slotPlus.h / 2 }), dur: 4.5 },
      { text: 'A full bus leaves the road. Send them all and clear the whole picture to win!', at: () => null, dur: 4 },
    ];
    coachT = 0;
  }
}

/** Magnet: bus `id` on the road fills up with its colour from the board and drives off. */
function magnetBus(id: number): void {
  const ev = sim.fillBus(id);
  if (!ev) { sfx.honk(); return; }
  spendArmed('magnet');
  magnetHold = id;
  const b = vb.get(id)!;
  b.popT = clock;
  burst(b.x, b.y, '#fff36b', 16, L.u * 0.35, L.u * 0.012);
  float('Full!', b.x, b.y - L.bw * 1.3, L.u * 0.055, '#ffffff', '#16842a', 1.1);
  sfx.merge();
  apply(ev);
}

/** Clear's helicopter timing (s): flying in to the bus, then lifting it to the hanging point. */
const VAC_FLY = 0.55, VAC_HANG = 1.15;

/** A toy helicopter centred at (x, y), `s` long: yellow body, round window, tail, spinning rotor. */
function drawHeli(x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(30, 25, 60, 0.18)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.1, y + s * 0.55, s * 0.45, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  // tail boom and fin
  ctx.fillStyle = '#e8a10f';
  roundRect(ctx, x + s * 0.2, y - s * 0.08, s * 0.55, s * 0.14, s * 0.07); ctx.fill();
  ctx.fillStyle = '#d23a3a';
  roundRect(ctx, x + s * 0.68, y - s * 0.25, s * 0.12, s * 0.3, s * 0.05); ctx.fill();
  // body
  ctx.fillStyle = '#2b2b35';
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.36, s * 0.27, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(0, y - s * 0.25, 0, y + s * 0.25);
  g.addColorStop(0, '#ffe36a'); g.addColorStop(1, '#f5a70f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.32, s * 0.23, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9fd9ff';
  ctx.beginPath(); ctx.ellipse(x - s * 0.1, y - s * 0.04, s * 0.15, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.15, y - s * 0.08, s * 0.05, s * 0.03, -0.5, 0, Math.PI * 2); ctx.fill();
  // skids
  ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 0.3, y + s * 0.34); ctx.lineTo(x + s * 0.25, y + s * 0.34); ctx.stroke();
  // rotor: a spinning blur on its mast
  ctx.fillStyle = '#3a3a48';
  ctx.fillRect(x - s * 0.02, y - s * 0.36, s * 0.04, s * 0.12);
  const a = clock * 40;
  ctx.fillStyle = 'rgba(60, 60, 80, 0.55)';
  for (const d of [0, Math.PI / 2]) {
    const c = Math.cos(a + d);
    ctx.beginPath(); ctx.ellipse(x, y - s * 0.37, s * 0.62 * Math.abs(c) + s * 0.05, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  }
}

/** Clear: parked bus `id` is lifted by a helicopter over the board, draws all its passengers in, then is flown away. */
function clearBus(id: number): void {
  const b = vb.get(id)!;
  const from = { x: b.x, y: b.y };
  const ev = sim.fillBus(id);
  if (!ev) { sfx.honk(); return; }
  spendArmed('broom');
  const geo = sim.geo;
  // the helicopter comes for it and hangs it over the middle of the board
  b.vac = { t: 0, from, to: px(geo.W / 2, geo.H - geo.vis * 0.55), out: -1 };
  b.head = UP;
  sfx.booster();
  apply(ev);
  // the passengers set off once the bus has risen
  for (const f of flights) if (f.bus === id) f.t -= VAC_HANG;
}

function spendArmed(key: BoosterKey): void {
  armed = null;
  boosterCounts[key]--;
  saveBoosters();
  FalconSDK.analytics.turn.useBooster(key);
}

// ---------------------------------------------------------------- loop

let lastTs = 0;
function frame(ts: number): void {
  perf.frames++;
  // Schedule first: one bad frame must never stop the loop for good.
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0);
  lastTs = ts;
  // The shell's webview can resize without a resize event: re-measure when the canvas changed.
  if (canvas.clientWidth !== L.w || canvas.clientHeight !== L.h) layout();
  const frozen = paused || FalconSDK.pause.isPaused() || document.hidden;
  if (!frozen) { clock += dt; update(dt); }
  // A hidden or collapsed view (e.g. a preview pane still opening) has no size yet: nothing to draw.
  if (L.w < 1 || L.h < 1 || !scene || !vb.size) return;
  try {
    draw();
  } catch (err) {
    console.error('[bus-loop] draw failed', err);
    // a frame that threw may leave save()s, a clip or an alpha behind: start the next one clean
    (ctx as CanvasRenderingContext2D & { reset?: () => void }).reset?.();
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
  }
}

/** Magnet: the bus being filled; the road waits until its passengers are aboard. */
let magnetHold = -1;
const simFrozen = (): boolean => !!overlay || tutorial === 0 || gathering() || armed === 'magnet' || (magnetHold >= 0 && flights.some((f) => f.bus === magnetHold));
const tickLen = (): number => TICK / speedMul();

function update(dt: number): void {
  if (state === 'playing') FalconSDK.analytics.turn.tick(dt);
  if (overlay) overlay.t += dt;
  if (overlay?.kind === 'loading' && overlay.t >= LOADING) overlay = { kind: 'home', t: 0 };
  if (overlay?.kind === 'settings' && overlay.confirm > 0) overlay.confirm = Math.max(0, overlay.confirm - dt);
  if (overlay?.kind === 'hard' && overlay.t > 2.2) closeHard();
  for (const k of keyFlights) {
    const was = k.t;
    k.t += dt;
    if (was < 0.7 && k.t >= 0.7 && k.toHud) { float('+1 Key', keyHud.x, keyHud.y - L.u * 0.04, L.u * 0.04, '#fff36b', '#7a3a00', 0.9); continue; }
    if (was < 0.7 && k.t >= 0.7) {
      // the key reaches its bus: the padlock pops open
      const b = vb.get(k.bus);
      if (b) {
        b.popT = clock;
        float('Unlocked!', b.x, b.y - L.bw * 1.3, L.u * 0.05, '#fff36b', '#7a3a00', 1.1);
        burst(b.x, b.y - L.bw * 0.5, '#ffd84a', 14, L.u * 0.25, L.u * 0.01);
      }
      sfx.booster();
      haptic(20);
    }
  }
  keyFlights = keyFlights.filter((k) => k.t < 0.75);
  const tick = tickLen();
  if ((state === 'playing' || state === 'won') && !simFrozen()) {
    tickAcc += dt;
    let guard = 0;
    while (tickAcc >= tick && guard++ < 6) {
      tickAcc -= tick;
      const t0 = performance.now();
      apply(sim.step());
      perf.sim += performance.now() - t0;
    }
  }
  frac = Math.min(1, tickAcc / tick);
  glide(dt);
  comboT -= dt;
  if (comboT <= 0) combo = 0;

  for (const b of vb.values()) {
    const s = sim.buses[b.id];
    if (s.where === 'lot') {
      const p = lotPos(b.id);
      b.x = p.x;
      b.y += (p.y - b.y) * Math.min(1, dt * 14);
      b.head = UP;
      if (b.wasHidden && !s.hidden) { b.wasHidden = false; b.revealT = clock; sfx.reveal(); burst(b.x, b.y - L.bw * 0.4, '#ffffff', 10, L.u * 0.25, L.u * 0.01); }
    } else if (s.where === 'enter') {
      // straight up out of the lot, onto the lane right above
      b.enterT += dt;
      const from = b.enterFrom ?? { x: b.x, y: b.y };
      const e = sim.pts[sim.entries[Math.max(0, s.col)]];
      const to = px(e.x, e.y);
      const k = Math.min(1, b.enterT / (ENTER_TICKS * tick));
      // a punchy start that settles onto the lane
      const ease = 1 - Math.pow(1 - k, 3);
      b.x = from.x + (to.x - from.x) * ease;
      b.y = from.y + (to.y - from.y) * ease;
      // straight up out of the lot, then it turns onto the lane (heading right)
      b.head = lerpAngle(b.head, k < 0.75 ? UP : 0, Math.min(1, dt * 10));
    } else if (s.where === 'road' || s.where === 'exit') {
      const p = roadPose(s.pos0 < 0 ? s.pos : s.pos0, s.pos, frac);
      b.x = p.x; b.y = p.y;
      b.head = lerpAngle(b.head, p.head, Math.min(1, dt * 14));
    } else if (b.vac) {
      const v = b.vac;
      v.t += dt;
      if (v.t < VAC_FLY) { b.x = v.from.x; b.y = v.from.y; }
      else if (v.out < 0) {
        // lifted to the hanging point, then a gentle sway while the passengers come aboard
        const k = Math.min(1, (v.t - VAC_FLY) / (VAC_HANG - VAC_FLY)), e = k * k * (3 - 2 * k);
        b.x = v.from.x + (v.to.x - v.from.x) * e + (k >= 1 ? Math.sin(v.t * 3) * L.bw * 0.08 : 0);
        b.y = v.from.y + (v.to.y - v.from.y) * e;
        if (v.t > VAC_HANG + 0.2 && !flights.some((f) => f.bus === b.id)) {
          v.out = 0;
          float('Cleared!', b.x, b.y - L.bw * 1.4, L.u * 0.055, '#fff36b', '#7a3a00', 1.1);
          burst(b.x, b.y - L.bw * 0.4, '#fff6a8', 10, L.u * 0.3, L.bw * 0.25, 'star');
        }
      } else {
        // carried away, up and out of the screen
        v.out += dt;
        b.x += dt * L.u * 0.9;
        b.y -= dt * L.u * (1.2 + v.out * 2);
        if (v.out > 0.9) b.vac = undefined;
      }
    } else if (b.absorbInto >= 0) {
      b.absorbT += dt;
    } else if (b.exit) {
      // a full bus with its tick drives on round the loop and out through the gate
      // it waits behind any bus right in front of it (no overtaking on the way out either)
      const gap = L.bw * 1.45;
      const fx = Math.cos(b.head), fy = Math.sin(b.head);
      let blocked = false;
      for (const o of vb.values()) {
        if (o === b) continue;
        const os = sim.buses[o.id];
        if (!(o.exit || os.where === 'road' || os.where === 'exit')) continue;
        const dx = o.x - b.x, dy = o.y - b.y;
        const ahead = dx * fx + dy * fy, side = Math.abs(dx * fy - dy * fx);
        if (ahead > 0 && ahead < gap && side < L.bw * 0.7) { blocked = true; break; }
      }
      if (!blocked) b.exitD += (L.cs / tick) * dt;
      const p = alongPx(b.exit, b.exitD);
      b.x = p.x; b.y = p.y;
      b.head = lerpAngle(b.head, p.ang, Math.min(1, dt * 14));
      if (p.lane) lightT = clock;
      if (p.done) b.exit = null;
    } else if (b.leaveT >= 0) {
      b.leaveT += dt;
      const sp = L.u * (0.5 + b.leaveT * 2.5);
      b.x += Math.cos(b.head) * sp * dt;
      b.y += Math.sin(b.head) * sp * dt;
    }
  }

  for (const f of flights) {
    const before = f.t;
    f.t += dt;
    // the moment a passenger sets off
    if (before < 0 && f.t >= 0) {
      const b = vb.get(f.bus);
      if (f.cell >= 0) { const p = cellPx(f.cell); f.x0 = p.x; f.y0 = p.y; }
      combo++;
      comboT = 0.4;
      if (combo % 2) sfx.take(combo >> 1);
      if (b) b.popT = Math.max(b.popT, clock - 0.2);
    }
  }
  for (const f of flights) if (f.t >= f.dur) { const b = vb.get(f.bus); if (b) b.popT = Math.max(b.popT, clock - 0.15); collected++; collectedT = clock; }
  flights = flights.filter((f) => f.t < f.dur);

  for (const p of particles) {
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'confetti') { p.vx *= 0.99; p.rot += dt * 6; } else if (p.kind === 'ball') { p.vy += L.u * 1.6 * dt; } else { p.vx *= 0.92; p.vy = p.vy * 0.92 + L.u * 0.4 * dt; p.rot += dt * 5; }
  }
  particles = particles.filter((p) => p.t < p.life);
  for (const f of floaters) { f.t += dt; f.y -= dt * L.u * 0.08; }
  for (const e of emojis) { e.t += dt; e.y -= dt * L.u * 0.03; }
  emojis = emojis.filter((e) => e.t < 1.6);
  emojiT -= dt;
  // now and then a passenger in view shows a face: the crowd feels alive
  if (state === 'playing' && !overlay && !gathering() && emojiT <= 0 && emojis.length < 4) {
    const roadTop = px(0, sim.geo.stemTop).y;
    for (let tries = 0; tries < 8; tries++) {
      const k = Math.floor(Math.random() * sim.n);
      if (sim.color[k] < 0) continue;
      const p = cellPx(k);
      if (p.y < L.top + L.u * 0.16 || p.y > roadTop + L.u * 0.1 || p.x < L.cx0 + L.u * 0.05 || p.x > L.cx0 + L.cw - L.u * 0.05) continue;
      emojis.push({ x: p.x, y: p.y - L.cs * 1.4, t: 0, kind: Math.floor(Math.random() * 3) });
      emojiT = 0.6 + Math.random() * 0.9;
      break;
    }
  }
  floaters = floaters.filter((f) => f.t < f.life);
  toastT = Math.max(0, toastT - dt);
  if (gathering() && !overlay) gatherT = Math.min(GATHER, gatherT + dt);
  // stuck on a full road while + can still open a slot: show the player the + (once)
  const roadFull = canPlay() && level + 1 >= SLOT_UNLOCK && sim.slots < MAX_SLOTS && sim.freeSlots() <= 0 && sim.fronts().some((f) => sim.canTap(f.id) === 'full');
  fullT = roadFull ? fullT + dt : 0;
  if (fullT > 1.5) slotHint();
  if (tutorial >= 0) tutorT += dt;
  if (coach.length && !overlay && !gathering()) { coachT += dt; if (coachT > coach[0].dur) { coach.shift(); coachT = 0; } }
  if (tutorial === 1 && tutorT > 5) tutorial = -1;
  if (tutorial === 3 && tutorT > 3.5) tutorial = -1;

  if (state === 'playing') {
    if (sim.won()) { state = 'won'; winT = 0; }
    else if (!simFrozen() && sim.stuck()) {
      state = 'lost';
      endT = 0.9;
      sfx.lose();
      haptic(60);
    }
  }
  if (state === 'won') {
    winT += dt;
    if (winT > 0.9 && !flights.length && overlay?.kind !== 'win') {
      overlay = { kind: 'win', t: 0 };
      sfx.win();
      confetti();
      if (!album.includes(level)) { album.push(level); FalconSDK.userData.set({ album: [...album] }); }
      // the level is cleared: close the analytics turn now; the popup's Next Level button moves on
      coins += 40;
      streak++;
      FalconSDK.userData.set({ coins, streak });
      events.emit('win');
    }
  }
  // Lost: the round is not over yet — the revive card offers a second chance first.
  if (state === 'lost' && !overlay && (endT -= dt) <= 0) {
    overlay = revives < MAX_REVIVES ? { kind: 'revive', t: 0, busy: false } : { kind: 'fail', t: 0 };
  }
}

// ---------------------------------------------------------------- drawing

function popScale(t: number): number {
  if (t < 0) return 1;
  if (t < 0.1) return 1 + (t / 0.1) * 0.15;
  if (t < 0.25) return 1.15 - ((t - 0.1) / 0.15) * 0.15;
  return 1;
}

function draw(): void {
  const { dpr, u } = L;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(scene!, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let pt = performance.now();
  drawMarbles();
  perf.crowd += performance.now() - pt;
  // the road and its raised curbs stand in front of the passengers beside them, as in the reference:
  // a body reaching down past the curb disappears behind it (buses and boarding passengers go on top)
  if (roadLayer) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(roadLayer, 0, 0); ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); }
  const geo = sim.geo;
  // the road counter on the median
  const used = sim.onRoad().length;
  const flash = clock - fullFlash < 0.8 && Math.floor((clock - fullFlash) * 8) % 2 === 0;
  const pc = px((geo.xL + geo.xR) / 2, geo.ym);
  slotPlus = slotPill(ctx, pc.x, pc.y, Math.min(geo.m * L.cs * 1.7, u * 0.065), used, sim.slots, used >= sim.slots || flash);
  // the key counter at the median's right end, on levels with locks
  if (sim.buses.some((b) => b.locked || b.keyBus) || sim.keys > 0 || keyFlights.length) {
    const kp = px(geo.xR + geo.m * 0.2, geo.ym);
    keyHud = kp;
    const shown = sim.keys - keyFlights.filter((k) => k.toHud && k.t < 0.7).length + keyFlights.filter((k) => !k.toHud && k.t < 0).length;
    const hh = Math.min(geo.m * L.cs * 1.5, u * 0.06), ww = hh * 2.1;
    ctx.fillStyle = 'rgba(20, 30, 90, 0.3)';
    roundRect(ctx, kp.x - ww / 2, kp.y - hh / 2 + hh * 0.18, ww, hh, hh / 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, kp.x - ww / 2 - 2, kp.y - hh / 2 - 2, ww + 4, hh + 4, hh / 2 + 2); ctx.fill();
    ctx.fillStyle = '#fff4d6';
    roundRect(ctx, kp.x - ww / 2, kp.y - hh / 2, ww, hh, hh / 2); ctx.fill();
    drawKey(ctx, kp.x - ww * 0.22, kp.y, hh * 0.95, -0.6);
    outlinedText(ctx, String(Math.max(0, shown)), kp.x + ww * 0.22, kp.y + 1, hh * 0.62, '#ffffff', '#5a3a00');
  }
  if (used >= sim.slots && sim.slots < MAX_SLOTS && canPlay()) {
    // road full and + can still open a slot: the + pulses
    const k = 0.5 + 0.5 * Math.sin(clock * 8);
    ctx.strokeStyle = `rgba(255, 243, 107, ${0.5 + 0.5 * k})`;
    ctx.lineWidth = u * (0.008 + 0.006 * k);
    roundRect(ctx, slotPlus.x - u * 0.008 * k, slotPlus.y - u * 0.008 * k, slotPlus.w + u * 0.016 * k, slotPlus.h + u * 0.016 * k, slotPlus.h * 0.3);
    ctx.stroke();
  }
  // light + barrier at the top of the side lane
  const open = Math.max(0, 1 - Math.max(0, clock - lightT - 0.4) * 3);
  const lt = px(geo.laneX + geo.lw * 0.66, geo.lotTop + 1.6);
  trafficLight(ctx, lt.x, lt.y - u * 0.012, u * 0.065, open > 0);
  barrier(ctx, lt.x, lt.y + u * 0.085, (geo.laneX + geo.lw * 0.66 - geo.lotL) * L.cs * 0.98, Math.min(1, open * 1.5));
  speedButton(ctx, L.speedX, L.speedY, L.speedR, speedMul() > 1, clock);

  drawEmojis();
  pt = performance.now();
  drawBuses();
  perf.buses += performance.now() - pt;
  drawTunnels();
  drawFlights();
  drawKeys();
  drawParticles();
  if (header) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(header, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  drawHud();

  for (const f of floaters) {
    const a = Math.min(1, (f.life - f.t) * 3);
    ctx.globalAlpha = a;
    outlinedText(ctx, f.text, f.x, f.y, f.size * popScale(f.t * 0.7), f.color, f.stroke);
    ctx.globalAlpha = 1;
  }
  drawBoosterBar();
  drawTutorial();
  if (armed === 'broom' || armed === 'magnet') drawArmed();
  if (toastT > 0) toast(ctx, toastMsg, L.w / 2, pc.y - u * 0.1, u * 0.04, Math.min(1, toastT * 3));
  if (devPrompt) toast(ctx, devPrompt.text, L.w / 2, L.h * 0.45, u * 0.05, 1);
  if (overlay) drawOverlay(overlay);
  drawPress();
}

/** Draw order for the marbles: back (higher up the screen) first, kept nearly sorted frame to frame. */
let order = new Int32Array(0);

/** The button being pressed (screen rect) and when: it bounces for PRESS seconds. */
let press: { r: Rect; t0: number } | null = null;
const PRESS = 0.26;
function pressAt(r: Rect): void { press = { r, t0: performance.now() / 1000 }; }

/**
 * The press bounce, on whatever is drawn under the rect: the frame's own pixels there are drawn
 * again, squashed down and springing back up a little bigger (never smaller than the original,
 * which it covers).
 */
function drawPress(): void {
  if (!press) return;
  const t = performance.now() / 1000 - press.t0;
  if (t > PRESS) { press = null; return; }
  const k = t / PRESS;
  const sx = 1 + 0.09 * Math.sin(k * Math.PI) * (1 - k * 0.3), sy = 1 + 0.05 * Math.sin(k * Math.PI * 2 + 0.3) * (1 - k) + 0.03 * Math.sin(k * Math.PI);
  const { x, y, w, h } = press.r, d = L.dpr;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.drawImage(canvas, x * d, y * d, w * d, h * d, cx - (w * sx) / 2, cy - (h * Math.max(1, sy)) / 2, w * sx, h * Math.max(1, sy));
}

/** A glossy marble of colour `col` centred on (x, y), `d` across. */
/** A passenger standing on a place of pitch d: a 3D toy figure whose head fills the place, its body showing below. */
function drawMarble(col: number, x: number, y: number, d: number): void {
  const e = d * 2.1;
  const size = Math.max(8, Math.round(e * L.dpr));
  ctx.drawImage(personSprite(col, 0, size), x - e / 2 + e * PERSON_X0, y - d * 0.05 - e * 0.285, e * PERSON_W, e);
}

/** Passengers carrying a key, collected while drawing the crowd (their keys go on top of it). */
const keyCarriers: number[] = [];

function drawMarbles(): void {
  const { cs } = L;
  keyCarriers.length = 0;
  if (order.length !== sim.n) order = Int32Array.from({ length: sim.n }, (_, i) => i);
  // insertion sort by y: the pile barely reorders between frames
  const ys = sim.y;
  for (let i = 1; i < order.length; i++) {
    const v = order[i], vy = ys[v];
    let j = i - 1;
    while (j >= 0 && ys[order[j]] > vy) { order[j + 1] = order[j]; j--; }
    order[j + 1] = v;
  }
  // the ones far above the screen are skipped without being looked at: the order is by y
  const ox = L.ox, oy = L.oy;
  const yCut = (L.top - cs * 2 - oy) / cs - 6;
  let lo = 0, hi = order.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ys[order[mid]] < yCut) lo = mid + 1; else hi = mid; }
  // one sprite per colour this frame (no per-passenger lookups)
  const e = cs * 2.1, size = Math.max(8, Math.round(e * L.dpr));
  const sx = -e / 2 + e * PERSON_X0, sy = -cs * 0.05 - e * 0.285, sw = e * PERSON_W;
  const spr: (HTMLCanvasElement | undefined)[] = [];
  const gathering0 = gatherT < GATHER;
  const top = L.top - cs * 2;
  for (let o = lo; o < order.length; o++) {
    const k = order[o];
    const col = sim.color[k];
    if (col < 0) continue;
    let x = ox + (sim.x[k] + offX[k]) * cs, y = oy + (ys[k] + offY[k]) * cs;
    if (gathering0 && k < gdx.length) {
      const q = Math.max(0, Math.min(1, (gatherT - gdel[k]) / gdur[k]));
      const ee = 1 - (1 - q) * (1 - q) * (1 - q);
      x += gdx[k] * (1 - ee) * cs;
      y += gdy[k] * (1 - ee) * cs - Math.sin(q * Math.PI) * cs * 0.6;
    }
    if (y < top) continue;
    if (sim.crate[k] > 0) { drawCrate(ctx, x, y, cs * 0.98, sim.crate[k]); continue; }
    const im = spr[col] ?? (spr[col] = personSprite(col, 0, size));
    ctx.drawImage(im, x + sx, y + sy, sw, e);
    if (sim.ice[k] > 0) drawIce(ctx, x, y - cs * 0.06, cs * 0.96, 0);
    if (sim.keyOf[k] >= 0) keyCarriers.push(k);
  }
}

/** The emoji faces bobbing on the pile: a kiss, a pleading face, a happy blush. */
function drawEmojis(): void {
  const r0 = L.cs * 1.25;
  for (const e of emojis) {
    const k = e.t < 0.2 ? popIn(e.t * 1.6) : 1;
    const a = Math.min(1, (1.6 - e.t) * 3);
    const r = r0 * k, x = e.x, y = e.y + Math.sin(e.t * 8) * r0 * 0.08;
    if (r < 0.5) continue;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(80, 40, 0, 0.25)';
    ctx.beginPath(); ctx.arc(x + r * 0.08, y + r * 0.12, r, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#fff3a0');
    g.addColorStop(0.6, '#ffd23a');
    g.addColorStop(1, '#f5a312');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 110, 110, 0.55)';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sx * r * 0.55, y + r * 0.22, r * 0.18, r * 0.11, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#5a3200';
    ctx.strokeStyle = '#5a3200';
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = 'round';
    if (e.kind === 1) {
      // pleading: big shiny eyes, a small frown
      for (const sx of [-1, 1]) {
        ctx.fillStyle = '#5a3200';
        ctx.beginPath(); ctx.arc(x + sx * r * 0.32, y - r * 0.08, r * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x + sx * r * 0.32 - r * 0.06, y - r * 0.15, r * 0.09, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y + r * 0.55, r * 0.18, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else {
      // closed happy eyes
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * r * 0.32, y - r * 0.05, r * 0.15, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      if (e.kind === 0) {
        // a kiss and a little heart
        ctx.beginPath(); ctx.arc(x + r * 0.05, y + r * 0.35, r * 0.1, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
        ctx.fillStyle = '#ff3b5c';
        const hx = x + r * 0.62, hy = y + r * 0.42, hs = r * 0.2;
        ctx.beginPath(); ctx.moveTo(hx, hy + hs); ctx.bezierCurveTo(hx - hs * 1.6, hy - hs * 0.2, hx - hs * 0.5, hy - hs * 1.3, hx, hy - hs * 0.3);
        ctx.bezierCurveTo(hx + hs * 0.5, hy - hs * 1.3, hx + hs * 1.6, hy - hs * 0.2, hx, hy + hs); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(x, y + r * 0.2, r * 0.3, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawHud(): void {
  const { u } = L;
  roundButton(ctx, L.homeX, L.homeY, L.homeR, 'gear');
  const pw = Math.min(L.cw * 0.385, u * 0.385);
  levelPill(ctx, L.cx0 + L.cw / 2 - pw / 2, L.hudY, pw, L.hudH, `Level ${level + 1}`, sim.progress(total) / 100);
  // the orange count of marbles collected, right of the bar (it swells as it ticks up)
  const pop = 1 + Math.max(0, 0.12 - (clock - collectedT)) * 1.2;
  const size = u * 0.085 * pop;
  const sx = L.cx0 + L.cw - u * 0.04, sy = L.hudY + L.hudH * 0.95;
  ctx.save();
  ctx.font = `italic 900 ${size}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const text = String(collected);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.26;
  ctx.strokeText(text, sx, sy);
  ctx.strokeStyle = '#d2560a';
  ctx.lineWidth = size * 0.1;
  ctx.strokeText(text, sx, sy);
  const og = ctx.createLinearGradient(0, sy - size / 2, 0, sy + size / 2);
  og.addColorStop(0, '#ffc23a');
  og.addColorStop(1, '#ff7a00');
  ctx.fillStyle = og;
  ctx.fillText(text, sx, sy);
  ctx.restore();
  if (spec.difficulty === 'hard' || spec.difficulty === 'super') {
    const tag = spec.difficulty === 'super' ? 'Super Hard' : 'Hard';
    ctx.font = `900 ${u * 0.03}px ${FONT}`;
    const tw = ctx.measureText(tag).width + u * 0.04;
    const tx = L.cx0 + L.cw / 2 - tw / 2, ty = L.hudY + L.hudH + u * 0.008;
    ctx.fillStyle = '#d81e3c';
    roundRect(ctx, tx, ty, tw, u * 0.045, u * 0.02); ctx.fill();
    outlinedText(ctx, tag, tx + tw / 2, ty + u * 0.023, u * 0.03, '#ffffff', '#6a0010');
  }
}

const numCache = new Map<string, { c: HTMLCanvasElement; w: number; h: number }>();
/** A bus's load on its roof, from a cache of pre-rendered outlined numbers (text is costly to stroke every frame). */
function roofNumber(n: number, x: number, y: number, w: number, tiers: number, hidden: boolean, scale = 1): void {
  // cached at the unscaled size (a popping bus only scales the picture)
  const size0 = w * (n >= 100 ? 0.5 : 0.58), size = size0 * scale;
  const ty = y + roofOffset(w * scale, tiers);
  const text = hidden ? '?' : String(n);
  const px = Math.max(6, Math.round(size0 * L.dpr));
  const key = `${text}|${px}`;
  let e = numCache.get(key);
  if (!e) {
    const sz = px / L.dpr;
    ctx.font = `900 ${sz}px ${FONT}`;
    const tw = ctx.measureText(text).width + sz * 0.5, th = sz * 1.5;
    const c = document.createElement('canvas');
    c.width = Math.ceil(tw * L.dpr); c.height = Math.ceil(th * L.dpr);
    const g = c.getContext('2d')!;
    g.scale(L.dpr, L.dpr);
    outlinedText(g, text, tw / 2, th / 2 + sz * 0.06, sz, 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.3)');
    outlinedText(g, text, tw / 2, th / 2, sz, '#ffffff', '#15161f');
    e = { c, w: tw, h: th };
    if (numCache.size > 600) numCache.clear();
    numCache.set(key, e);
  }
  const k = size / (px / L.dpr);
  ctx.drawImage(e.c, x - (e.w * k) / 2, ty - (e.h * k) / 2, e.w * k, e.h * k);
}

function shownCap(id: number): number {
  let n = sim.buses[id].cap;
  for (const f of flights) if (f.bus === id) n++;
  return n;
}

/** Every bus, parked or driving, back to front so nearer ones overlap. */
function drawBuses(): void {
  const { dpr, bw } = L;
  const hint = tutorialTargets();
  // ropes under the parked buses
  for (const s of sim.buses) {
    if (s.where !== 'lot' || s.link < s.id || sim.buses[s.link].where !== 'lot') continue;
    const a = vb.get(s.id)!, b = vb.get(s.link)!;
    for (const [col, lw, dash] of [['#6b3d14', 0.14, 0], ['#d9a35a', 0.08, 1]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = bw * lw;
      ctx.lineCap = 'round';
      ctx.setLineDash(dash ? [bw * 0.12, bw * 0.08] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - bw * 0.3);
      ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2, b.x, b.y - bw * 0.3);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  const list = sim.buses.filter((s) => {
    const b = vb.get(s.id)!;
    if (s.where === 'lot') return b.y < L.h + bw * 1.5;
    // underground in a tunnel: out of sight (the mouths cover the ends)
    if (s.where === 'road' || s.where === 'exit') return !sim.tunnelAt[Math.floor(s.pos) % sim.pts.length];
    if (s.where === 'enter') return true;
    if (b.vac) return true;
    if (b.absorbInto >= 0) return b.absorbT < 0.35;
    return !!b.exit || (b.leaveT >= 0 && b.leaveT < 0.6);
  }).sort((a, z) => vb.get(a.id)!.y - vb.get(z.id)!.y);
  for (const s of list) {
    const b = vb.get(s.id)!;
    const tiers = tierOf(s);
    if (s.where === 'lot') {
      const sh = clock - b.shakeT < 0.3 ? Math.sin((clock - b.shakeT) * 60) * bw * 0.06 : armed === 'broom' ? Math.sin(clock * 20 + s.id * 1.3) * bw * 0.045 : 0;
      const pop = popScale(clock - b.popT) * popScale(clock - b.revealT);
      if (hint.includes(s.id)) {
        ctx.fillStyle = `rgba(255, 243, 107, ${0.45 + 0.25 * Math.sin(clock * 7)})`;
        roundRect(ctx, b.x - bw * 0.68, b.y - bw * 1.05, bw * 1.36, bw * 1.55, bw * 0.3);
        ctx.fill();
      }
      drawBus(ctx, s.color, 1, s.hidden, b.x + sh, b.y, bw, dpr, UP, pop);
      if (s.frozen > 0) {
        // frozen: a block of ice round the bus, the count of buses still to leave on top
        const k = pop;
        const ig = ctx.createLinearGradient(b.x + sh - bw * 0.6, b.y - bw, b.x + sh + bw * 0.6, b.y + bw * 0.7);
        ig.addColorStop(0, 'rgba(225, 248, 255, 0.92)');
        ig.addColorStop(1, 'rgba(120, 200, 245, 0.85)');
        ctx.fillStyle = 'rgba(40, 110, 170, 0.35)';
        roundRect(ctx, b.x + sh - bw * 0.62 * k, b.y - bw * 0.9 * k + bw * 0.08, bw * 1.24 * k, bw * 1.62 * k, bw * 0.24); ctx.fill();
        ctx.fillStyle = ig;
        roundRect(ctx, b.x + sh - bw * 0.62 * k, b.y - bw * 0.9 * k, bw * 1.24 * k, bw * 1.58 * k, bw * 0.24); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = bw * 0.06;
        ctx.beginPath(); ctx.moveTo(b.x + sh - bw * 0.42, b.y - bw * 0.55); ctx.lineTo(b.x + sh - bw * 0.1, b.y - bw * 0.78); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(b.x + sh + bw * 0.25, b.y + bw * 0.4); ctx.lineTo(b.x + sh + bw * 0.45, b.y + bw * 0.25); ctx.stroke();
        const cy0 = b.y - bw * 0.2;
        ctx.fillStyle = '#1f6fd6';
        ctx.beginPath(); ctx.arc(b.x + sh, cy0, bw * 0.34 * k, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = bw * 0.07;
        ctx.stroke();
        outlinedText(ctx, String(s.frozen), b.x + sh, cy0 + 1, bw * 0.42 * k, '#ffffff', '#0b3a80');
      } else if (s.locked || keyFlights.some((k) => k.bus === s.id && !k.toHud)) {
        // padlocked: a big gold lock over the whole bus, as in the reference
        ctx.fillStyle = 'rgba(30, 25, 60, 0.35)';
        roundRect(ctx, b.x + sh - bw * 0.55, b.y - bw * 0.85, bw * 1.1, bw * 1.5, bw * 0.3); ctx.fill();
        drawPadlock(ctx, b.x + sh, b.y - bw * 0.2, bw * 0.78 * pop);
      } else {
        roofNumber(s.cap, b.x + sh, b.y, bw, 1, s.hidden, pop);
        // a key standing on the roof: sending this bus out collects it
        if (s.keyBus) drawKey(ctx, b.x + sh + bw * 0.05, b.y + roofOffset(bw, 1) - bw * 0.15 + Math.sin(clock * 4 + s.id) * bw * 0.04, bw * 0.75 * pop, -Math.PI / 2 + 0.25);
      }
    } else if (s.where === 'exit') {
      // full: drives on in its place in the line, its passengers' last flights landing, then the tick
      const pop = popScale(clock - b.popT);
      drawBus(ctx, s.color, Math.max(1, tiers), false, b.x, b.y, bw, dpr, b.head, pop);
      if (flights.some((f) => f.bus === s.id)) roofNumber(shownCap(s.id), b.x, b.y, bw, Math.max(1, tiers), false, pop);
      else checkBadge(b.x, b.y + roofOffset(bw, Math.max(1, tiers)), bw * 0.32);
    } else if (s.where === 'enter' || s.where === 'road') {
      const pop = popScale(clock - b.popT);
      // waiting to be picked by the Magnet: a gentle wobble
      const wob = armed === 'magnet' ? Math.sin(clock * 22 + s.id * 1.7) * bw * 0.05 : 0;
      drawBus(ctx, s.color, tiers, false, b.x + wob, b.y, bw, dpr, b.head + wob / bw * 0.6, pop);
      roofNumber(shownCap(s.id), b.x + wob, b.y, bw, tiers, false, pop);
    } else if (b.vac) {
      // Clear: hanging from the helicopter, drawing its passengers in (its count runs down)
      const v = b.vac, k = Math.min(1, Math.max(0, (v.t - VAC_FLY) / (VAC_HANG - VAC_FLY)));
      const sc = 1 + k * 0.2;
      // the helicopter: flies in from the top right, then holds the bus on a short cable
      const hookY = b.y - bw * 1.25 * sc;
      let hx = b.x, hy = hookY - bw * 0.9;
      if (v.t < VAC_FLY) { const f = 1 - v.t / VAC_FLY; hx += f * L.cw * 0.8; hy -= f * L.h * 0.35; }
      if (v.t >= VAC_FLY) {
        ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = bw * 0.05;
        ctx.beginPath(); ctx.moveTo(hx, hy + bw * 0.3); ctx.lineTo(b.x, hookY + bw * 0.25); ctx.stroke();
      }
      drawBus(ctx, s.color, 1, false, b.x, b.y, bw, dpr, UP, sc);
      roofNumber(shownCap(s.id), b.x, b.y, bw * sc, 1, false);
      drawHeli(hx, hy, bw * 1.15);
    } else if (b.absorbInto >= 0) {
      // flying into the bus it merged with
      const t = Math.min(1, b.absorbT / 0.35), to = busPos(b.absorbInto), from = b.absorbFrom!;
      const x = from.x + (to.x - from.x) * t, y = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * bw * 1.2;
      drawBus(ctx, s.color, 1, false, x, y, bw, dpr, b.head, 1 - t * 0.5);
    } else if (b.exit) {
      drawBus(ctx, s.color, Math.max(1, tiers), false, b.x, b.y, bw, dpr, b.head);
      checkBadge(b.x, b.y + roofOffset(bw, Math.max(1, tiers)), bw * 0.32);
    } else {
      const k = b.leaveT / 0.6;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      drawBus(ctx, s.color, Math.max(1, tiers), false, b.x, b.y, bw, dpr, b.head, 1 - k * 0.3);
      ctx.globalAlpha = 1;
    }
  }
}

/** A passenger's soft shadow on the ground at (x, y), smaller and fainter the higher they are (lift, px). */
function passengerShadow(x: number, y: number, d: number, lift: number): void {
  const k = Math.max(0.35, 1 - Math.max(0, lift) / (L.cs * 6));
  ctx.fillStyle = `rgba(30, 25, 70, ${0.3 * k})`;
  ctx.beginPath(); ctx.ellipse(x - lift * 0.15, y, d * 0.5 * k, d * 0.18 * k, 0, 0, Math.PI * 2); ctx.fill();
}

/** Keys: bobbing over their carriers, and flying to the bus they unlock. */
function drawKeys(): void {
  const { cs } = L;
  for (const k of keyCarriers) {
    if (sim.color[k] < 0) continue;
    const p = cellPx(k);
    const bob = Math.sin(clock * 5 + k) * cs * 0.15;
    // a soft gold glow marks the carrier in the crowd
    const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, cs * 2.4);
    gl.addColorStop(0, 'rgba(255, 220, 80, 0.7)');
    gl.addColorStop(1, 'rgba(255, 220, 80, 0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(p.x, p.y, cs * 2.4, 0, Math.PI * 2); ctx.fill();
    drawKey(ctx, p.x + cs * 0.2, p.y - cs * 2 + bob, cs * 3, -0.5);
  }
  for (const f of keyFlights) {
    const b = vb.get(f.bus);
    if (!b || f.t < 0) continue;
    const k = Math.min(1, f.t / 0.7), e = k * k * (3 - 2 * k);
    const tx = f.toHud ? keyHud.x : b.x, ty = f.toHud ? keyHud.y : b.y - L.bw * 0.2;
    const x = f.x0 + (tx - f.x0) * e, y = f.y0 + (ty - f.y0) * e - Math.sin(k * Math.PI) * cs * 5;
    drawKey(ctx, x, y, cs * (1.6 + Math.sin(k * Math.PI) * 0.8), -0.5 + k * 6.3);
  }
}

/**
 * Tunnels (ref 1): the road dives underground at one mouth and comes up at the other, round
 * the ring's corner. Each mouth is a clay block over the road, its dark opening towards the
 * road it serves, an arrow pressed in its top showing which way the buses go.
 */
function drawTunnels(): void {
  const tun = spec.tunnels ?? [];
  if (!tun.length) return;
  const n = sim.pts.length;
  for (const [a, len] of tun) {
    mouth(a, (a - 2 + n) % n, true);
    mouth((a + len) % n, (a + len + 2) % n, false);
  }
}

/** One tunnel mouth at road point `at`; `toward` is the road point the opening faces. */
function mouth(at: number, toward: number, entrance: boolean): void {
  const { cs } = L, geo = sim.geo;
  const p = px(sim.pts[at].x, sim.pts[at].y), q = px(sim.pts[toward].x, sim.pts[toward].y);
  // local x points out of the opening, along the road
  const ang = Math.atan2(q.y - p.y, q.x - p.x);
  const len = geo.lw * cs * 1.15, wid = geo.lw * cs * 1.45, depth = cs * 0.9;
  // the block sits over the underground side
  const cx = p.x - Math.cos(ang) * len * 0.42, cy = p.y - Math.sin(ang) * len * 0.42;
  const body = (dx: number, dy: number, l: number, w2: number, r: number): void => {
    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate(ang);
    roundRect(ctx, -l / 2, -w2 / 2, l, w2, r);
    ctx.restore();
  };
  ctx.fillStyle = 'rgba(70, 35, 10, 0.25)';
  body(-cs * 0.4, depth + cs * 0.4, len, wid, wid * 0.3); ctx.fill();
  ctx.fillStyle = '#c47428';
  body(0, depth, len, wid, wid * 0.3); ctx.fill();
  // the opening: a dark arch on the face towards the road
  ctx.save();
  ctx.translate(cx + Math.cos(ang) * len * 0.5, cy + Math.sin(ang) * len * 0.5 + depth * 0.45);
  ctx.rotate(ang);
  ctx.fillStyle = '#4a2408';
  ctx.beginPath(); ctx.ellipse(0, 0, len * 0.2, wid * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const top = ctx.createLinearGradient(cx - wid / 2, cy - wid / 2, cx + wid / 2, cy + wid / 2);
  top.addColorStop(0, '#ffd59a');
  top.addColorStop(1, '#f0a554');
  ctx.fillStyle = top;
  body(0, 0, len, wid, wid * (entrance ? 0.22 : 0.42)); ctx.fill();
  ctx.fillStyle = 'rgba(255, 240, 210, 0.55)';
  body(-cs * 0.15, -cs * 0.2, len * 0.7, wid * 0.55, wid * 0.2); ctx.fill();
  // the arrow: the way the buses drive (into the entrance, out of the exit)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(entrance ? ang + Math.PI : ang);
  const sz = wid * 0.24;
  ctx.fillStyle = '#d4842f';
  ctx.beginPath();
  ctx.moveTo(-sz, -sz * 0.32); ctx.lineTo(sz * 0.1, -sz * 0.32); ctx.lineTo(sz * 0.1, -sz * 0.78); ctx.lineTo(sz, 0);
  ctx.lineTo(sz * 0.1, sz * 0.78); ctx.lineTo(sz * 0.1, sz * 0.32); ctx.lineTo(-sz, sz * 0.32); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFlights(): void {
  const { cs } = L;
  for (const f of flights) {
    if (f.t < 0) {
      // waiting its turn: lifted out of the pile, jiggling on the spot
      const hop = Math.abs(Math.sin((clock + f.x0 * 0.05) * 14)) * cs * 0.15;
      passengerShadow(f.x0, f.y0 + cs * 1.25, cs * 1.05, cs * 0.2 + hop);
      drawMarble(f.color, f.x0, f.y0 - cs * 0.2 - hop, cs * 1.05);
      continue;
    }
    const k = Math.min(1, f.t / f.dur);
    // homing on the bus where it is this frame, so the passenger follows it all the way in
    const to = roofPos(f.bus);
    const span = Math.hypot(to.x - f.x0, to.y - f.y0);
    const cx = (f.x0 + to.x) / 2, cy = Math.min(f.y0, to.y) - Math.min(cs * 3, cs * 0.8 + span * 0.25);
    // quick out of the crowd, easing into the bus
    const e = 1 - (1 - k) * (1 - k) * (1 - k), u = 1 - e;
    const x = u * u * f.x0 + 2 * u * e * cx + e * e * to.x;
    const y = u * u * f.y0 + 2 * u * e * cy + e * e * to.y;
    const grow = k < 0.2 ? 1 + (k / 0.2) * 0.15 : 1.15 - ((k - 0.2) / 0.8) * 0.5;
    // its shadow runs along the ground below: the same curve without the lift
    const gy = u * u * f.y0 + 2 * u * e * ((f.y0 + to.y) / 2) + e * e * to.y;
    passengerShadow(x, gy + cs * 1.25 * grow, cs * grow, gy - y);
    drawMarble(f.color, x, y, cs * grow);
  }
}

function drawParticles(): void {
  for (const p of particles) {
    const a = Math.max(0, 1 - p.t / p.life);
    ctx.globalAlpha = Math.min(1, a * 1.5);
    if (p.kind === 'confetti' || p.kind === 'shard') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
      ctx.restore();
    } else if (p.kind === 'ball') {
      drawMarble(p.ball, p.x, p.y, p.size);
    } else if (p.kind === 'star') {
      // a four-point sparkle that twinkles as it fades
      const r = p.size * (0.6 + 0.4 * Math.sin(p.t * 18 + p.rot)), w = r * 0.28;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + w, p.y - w); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x + w, p.y + w);
      ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - w, p.y + w); ctx.lineTo(p.x - r, p.y); ctx.lineTo(p.x - w, p.y - w);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- tutorial

/** The buses the tutorial points at. */
function tutorialTargets(): number[] {
  if (tutorial === 0) {
    const id = botPick(sim, mulberry32(7));
    return id >= 0 ? [id] : [];
  }
  if (tutorial === 2) {
    // three of a colour: the ones still parked at the front
    const road = sim.onRoad();
    for (const f of sim.fronts()) {
      const same = sim.fronts().filter((o) => o.color === f.color && !o.hidden);
      if (same.length + road.filter((o) => o.color === f.color).length >= 3) return same.map((o) => o.id);
    }
  }
  return [];
}

function drawHand(p: Pt, t: number): void {
  const { u } = L;
  const bob = Math.sin(t * 6) * u * 0.015;
  const x = p.x + u * 0.03, y = p.y - u * 0.02 + bob;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.4);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b2150';
  ctx.lineWidth = u * 0.006;
  roundRect(ctx, -u * 0.018, -u * 0.01, u * 0.036, u * 0.08, u * 0.018); ctx.fill(); ctx.stroke();
  roundRect(ctx, -u * 0.035, u * 0.04, u * 0.075, u * 0.07, u * 0.025); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8303f';
  roundRect(ctx, -u * 0.04, u * 0.1, u * 0.085, u * 0.03, u * 0.01); ctx.fill();
  ctx.restore();
}

/** The coach steps that follow an intro card: the hand on the thing it introduced. */
function coachFor(what: IntroKey): CoachStep[] {
  const { u } = L;
  // the place of a passenger nearest the road that matches (live: it moves with the crowd)
  const nearRoad = (ok: (i: number) => boolean) => (): Pt | null => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < sim.n; i++) {
      if (sim.color[i] < 0 || !ok(i)) continue;
      const d = roadDist(sim.geo, sim.x[i], sim.y[i]);
      if (d < bd && cellPx(i).y > L.top + u * 0.15) { bd = d; best = i; }
    }
    return best >= 0 ? cellPx(best) : null;
  };
  const booster = (key: BoosterKey) => (): Pt | null => {
    if (key === 'slot') return { x: slotPlus.x + slotPlus.w / 2, y: slotPlus.y + slotPlus.h / 2 };
    const s = boosterSpots.find((b) => b.key === key);
    return s ? { x: s.x, y: s.y } : null;
  };
  switch (what) {
    case 'hidden': return [
      { text: 'This ? bus hides its colour. Send out the bus in front of it to reveal it!', at: () => { const b = sim.inLot().find((x) => x.hidden); return b ? busPos(b.id) : null; }, dur: 5 },
    ];
    case 'tunnel': return [
      { text: 'Buses drive into this tunnel and come back up at the other end. No pickups underground!', at: () => {
        const t = (spec.tunnels ?? [])[0];
        if (!t) return null;
        const q = sim.pts[t[0]];
        return px(q.x, q.y);
      }, dur: 5.5 },
    ];
    case 'frozen': return [
      { text: 'This bus is frozen. Every bus you send out melts it a little: at 0 it can go!', at: () => { const b = sim.inLot().find((x) => x.frozen > 0); return b ? busPos(b.id) : null; }, dur: 5.5 },
    ];
    case 'ice': return [
      { text: 'Frozen passengers need two pickups: the first one only cracks the ice.', at: nearRoad((i) => sim.ice[i] > 0), dur: 5 },
    ];
    case 'lock': return [
      { text: 'This bus carries a key! Send it out and the key goes to your key counter.', at: () => { const b = sim.inLot().find((x) => x.keyBus); return b ? busPos(b.id) : null; }, dur: 5 },
      { text: 'This bus is padlocked. Once it reaches the front of its line, a collected key opens it.', at: () => { const b = sim.inLot().find((x) => x.locked); return b ? busPos(b.id) : null; }, dur: 5.5 },
    ];
    case 'link': return [
      { text: 'Roped buses leave together: both must be at the front of their lines, and they need 2 free slots.', at: () => {
        const b = sim.inLot().find((x) => x.link >= 0);
        if (!b) return null;
        const a = busPos(b.id), z = busPos(b.link);
        return { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
      }, dur: 6 },
    ];
    case 'slot': return [{ text: 'Road full? Tap + on the counter to open one more slot!', at: booster('slot'), dur: 6 }];
    case 'broom': return [{ text: 'Tap Clear Bus, then any parked bus: it takes all its passengers without using a slot!', at: booster('broom'), dur: 6 }];
    case 'magnet': return [{ text: 'Tap Magnet, then a bus on the road: it fills up at once and leaves!', at: booster('magnet'), dur: 6 }];
    case 'shuffle': return [{ text: 'Tap Shuffle to mix up the parked buses for a better line-up!', at: booster('shuffle'), dur: 6 }];
  }
  return [];
}

/** The mascot's line, away from what the hand points at: at the bottom, or under the HUD when the hand is low. */
function coachDialog(text: string, at: Pt | null): void {
  const { u } = L;
  const low = !!at && at.y > L.h * 0.5;
  const r: Rect = { x: L.cx0 + u * 0.03, y: low ? L.hudY + L.hudH + u * 0.21 : L.h - u * 0.25, w: L.cw - u * 0.06, h: u * 0.165 };
  // up top the mascot sits at the right end, clear of the settings button
  drawMascot(ctx, low ? r.x + r.w * 0.74 : r.x + u * 0.12, r.y - u * 0.07, u * 0.16, 1, clock);
  dialog(ctx, r, 'Bubba', text, u * 0.036);
}

function drawTutorial(): void {
  if (overlay || gathering()) return;
  if (coach.length) {
    const step = coach[0];
    const at = step.at();
    if (at) drawHand(at, clock);
    // fade in
    ctx.globalAlpha = Math.min(1, coachT * 4);
    coachDialog(step.text, at);
    ctx.globalAlpha = 1;
    return;
  }
  if (tutorial < 0) return;
  const targets = tutorialTargets();
  if (tutorial === 0 || tutorial === 2) for (const id of targets) drawHand(busPos(id), clock);
  const text = tutorial === 0
    ? 'Tap a bus to send it out onto the road!'
    : tutorial === 1
      ? 'Buses keep driving until they are full. Watch the slots: a full road can jam!'
      : tutorial === 2
        ? 'Send three buses of one colour onto the road: they merge into one big bus!'
        : 'Merged buses carry it all and use only one slot!';
  coachDialog(text, targets.length ? busPos(targets[0]) : null);
}

// ---------------------------------------------------------------- boosters

/**
 * A booster waiting for its pick (as in the reference): the screen dims except where the pick
 * goes — the lot for Clear, the road for Magnet — with a bubble saying what to pick.
 */
function drawArmed(): void {
  const { u } = L, geo = sim.geo;
  const lotY = px(0, geo.row0 - geo.rowH * 0.6).y;
  ctx.fillStyle = 'rgba(15, 20, 45, 0.5)';
  if (armed === 'broom') ctx.fillRect(L.cx0, 0, L.cw, lotY);
  else ctx.fillRect(L.cx0, lotY, L.cw, L.h - lotY - L.boosterR * 2.4);
  const text = armed === 'broom' ? 'Pick a bus below to clear' : 'Pick a bus on the road to clear';
  const y = armed === 'broom' ? lotY - u * 0.07 : lotY + u * 0.07;
  ctx.font = `800 ${u * 0.036}px ${FONT}`;
  const w = ctx.measureText(text).width + u * 0.08, h = u * 0.075;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  roundRect(ctx, L.w / 2 - w / 2, y - h / 2 + 3, w, h, h * 0.3); ctx.fill();
  ctx.fillStyle = '#fff9ec';
  roundRect(ctx, L.w / 2 - w / 2, y - h / 2, w, h, h * 0.3); ctx.fill();
  const dir = armed === 'broom' ? 1 : -1;
  ctx.beginPath(); ctx.moveTo(L.w / 2 - h * 0.25, y + dir * h / 2); ctx.lineTo(L.w / 2 + h * 0.25, y + dir * h / 2); ctx.lineTo(L.w / 2, y + dir * h * 0.85); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a3a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, L.w / 2, y + 1);
}

function drawBoosterBar(): void {
  const r = L.boosterR;
  const gap = Math.min(r * 2.75, L.cw / 3.4);
  const cx = L.cx0 + L.cw / 2;
  boosterSpots = BOOSTERS.map((bb, i) => ({ key: bb.key, x: cx + (i - 1) * gap, y: L.boosterY, r }));
  const usable = canPlay();
  for (const [i, sp] of boosterSpots.entries()) {
    const t = clock - (boosterPress[sp.key] ?? -9);
    const press = t < 0.15 ? 1 - t / 0.15 : 0;
    const lock = level + 1 < BOOSTERS[i].unlock ? BOOSTERS[i].unlock : 0;
    const art = BOOSTER_ART[sp.key];
    // the picture's circle is 240 px across its radius: back to the first buttons' size (≈ r)
    const k = (r * 0.98 / 240) * (1 - 0.08 * press);
    ctx.save();
    ctx.globalAlpha = usable || armed === sp.key ? 1 : 0.8;
    if (armed === sp.key) {
      ctx.fillStyle = `rgba(255, 243, 107, ${0.5 + 0.25 * Math.sin(clock * 8)})`;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r * 1.35, 0, Math.PI * 2); ctx.fill();
    }
    if (art.img.complete && art.img.naturalWidth) {
      const sc = k * (art.w0 / art.img.naturalWidth);
      ctx.drawImage(art.img, sp.x - art.cx * k, sp.y - art.cy * k, art.img.naturalWidth * sc, art.img.naturalHeight * sc);
    }
    // the badge: the count, or a green + when empty (tap for 3 more)
    const bx = sp.x + (art.bx - art.cx) * k, by = sp.y + (art.by - art.cy) * k, br = 86 * k;
    const n = boosterCounts[sp.key];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(bx, by, br * 1.08, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, by - br, 0, by + br);
    g.addColorStop(0, n > 0 ? '#ff6b73' : '#5fe35a'); g.addColorStop(1, n > 0 ? '#d81e2c' : '#1fa82c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(bx - br * 0.15, by - br * 0.45, br * 0.55, br * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    outlinedText(ctx, n > 0 ? String(n) : '+', bx, by + br * 0.04, br * (n > 0 ? 1.15 : 1.5), '#ffffff', n > 0 ? '#7a0a18' : '#0a5a1c');
    if (lock) {
      ctx.fillStyle = 'rgba(40, 40, 60, 0.55)';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r * 1.12, 0, Math.PI * 2); ctx.fill();
      outlinedText(ctx, `Lv ${lock}`, sp.x, sp.y, r * 0.5, '#ffffff', '#15161f');
    }
    ctx.restore();
  }
}

function loadSave(): void {
  const sv = FalconSDK.userData.get() as { coins?: number; streak?: number };
  coins = typeof sv.coins === 'number' ? sv.coins : 0;
  streak = typeof sv.streak === 'number' ? sv.streak : 0;
  const d = FalconSDK.userData.get() as { boosters?: Partial<Record<BoosterKey, number>>; album?: number[]; intros?: string[] };
  for (const k of Object.keys(boosterCounts) as BoosterKey[]) boosterCounts[k] = typeof d.boosters?.[k] === 'number' ? d.boosters[k]! : BOOSTER_START[k];
  album = Array.isArray(d.album) ? d.album.filter((n) => typeof n === 'number') : [];
  seenIntros = Array.isArray(d.intros) ? d.intros.filter((n) => typeof n === 'string') : [];
}

function saveBoosters(): void {
  FalconSDK.userData.set({ boosters: { ...boosterCounts } });
}

/** Apply booster `key` now; false when it cannot apply (the player keeps the unit). */
function activate(key: BoosterKey): boolean {
  const geo = sim.geo;
  const pc = px((geo.xL + geo.xR) / 2, geo.ym);
  if (key === 'slot') {
    if (sim.slots >= MAX_SLOTS) { showToast(`Max ${MAX_SLOTS} buses on the road`); return false; }
    sim.addSlot();
    float('+1 Slot!', pc.x, pc.y - L.u * 0.05, L.u * 0.055, '#ffffff', '#16842a', 1.2);
    burst(pc.x, pc.y, '#9ff07a', 16, L.u * 0.35, L.u * 0.012);
  } else if (key === 'magnet') {
    // pick a bus on the road: it fills up at once and drives off
    if (!sim.onRoad().some((b) => b.where === 'road' && b.cap > 0)) { showToast('No bus on the road'); return false; }
    armed = 'magnet';
    return true; // the unit is spent on the pick itself
  } else if (key === 'broom') {
    // pick a parked bus: it lifts to the top of the road and draws all its passengers in
    if (!sim.inLot().length) { showToast('No bus to clear'); return false; }
    armed = 'broom';
    return true;
  } else if (key === 'shuffle') {
    if (!sim.shuffleLot(Math.random)) { showToast('Nothing to shuffle'); return false; }
    for (const s of sim.inLot()) {
      const b = vb.get(s.id)!;
      b.popT = clock + Math.random() * 0.15;
      b.wasHidden = s.hidden;
      // sparkles round every bus that moved
      if (b.y < L.h) {
        burst(b.x, b.y - L.bw * 0.3, '#fff6a8', 5, L.u * 0.18, L.bw * 0.22, 'star');
        burst(b.x, b.y - L.bw * 0.3, '#ffffff', 3, L.u * 0.12, L.bw * 0.16, 'star');
      }
    }
  }
  sfx.booster();
  FalconSDK.analytics.turn.useBooster(key);
  return true;
}

async function useBooster(key: BoosterKey): Promise<void> {
  unlockAudio();
  if (!canPlay()) return;
  const unlock = key === 'slot' ? SLOT_UNLOCK : BOOSTERS.find((b) => b.key === key)!.unlock;
  if (level + 1 < unlock) { showToast(`Unlocks at level ${unlock}`); return; }
  boosterPress[key] = clock;
  if (armed === key) { armed = null; return; } // tap again to put it away
  // + on the road counter is free, up to MAX_SLOTS
  if (key === 'slot') { activate('slot'); return; }
  if (boosterCounts[key] <= 0) {
    // Empty: tap + to refill it for free
    boosterCounts[key] = BOOSTER_REFILL;
    saveBoosters();
    sfx.booster();
    showToast(`+${BOOSTER_REFILL} boosters!`);
    return;
  }
  if (!activate(key)) return;
  if (key !== 'magnet' && key !== 'broom') {
    boosterCounts[key]--;
    saveBoosters();
  }
}

// ---------------------------------------------------------------- overlays

const INTRO: Record<IntroKey, { title: string; lines: string[] }> = {
  hidden: { title: 'Mystery Bus', lines: ['A ? bus hides its colour.', 'It shows it at the front of its line!'] },
  ice: { title: 'Frozen Passengers', lines: ['Ice needs one extra pickup', 'from a bus of the same colour.'] },
  tunnel: { title: 'Tunnels', lines: ['The road dives underground here:', 'no pickups until it comes back up!'] },
  frozen: { title: 'Frozen Bus', lines: ['Send out the shown number of buses', 'and the ice melts!'] },
  lock: { title: 'Locks & Keys', lines: ['Send out a bus with a key to collect it:', 'a key opens a locked bus at the front!'] },
  link: { title: 'Roped Buses', lines: ['Two roped buses leave together:', 'both must be at the front.'] },
  slot: { title: 'Add Slot', lines: ['Tap + on the road counter:', 'one more bus can drive at a time!'] },
  magnet: { title: 'Magnet', lines: ['Pick a bus on the road:', 'it fills up at once and drives off!'] },
  broom: { title: 'Clear Bus', lines: ['Pick any parked bus: it rises up', 'and takes all its passengers!'] },
  shuffle: { title: 'Shuffle', lines: ['Mix up the parked buses', 'for a better line-up!'] },
};

function drawIntroIcon(what: IntroKey, x: number, y: number, s: number): void {
  if (what === 'magnet' || what === 'broom' || what === 'shuffle') {
    // the same button as in the booster bar (its art, without the count badge's number)
    const art = BOOSTER_ART[what], im = art.img;
    if (im.complete && im.naturalWidth) {
      const k = (s * 0.9) / 582, sc = art.w0 / im.naturalWidth;
      ctx.drawImage(im, x - (art.w0 * k) / 2, y - (582 * k) / 2, im.naturalWidth * sc * k, im.naturalHeight * sc * k);
      const bx = x - (art.w0 * k) / 2 + art.bx * k, by = y - (582 * k) / 2 + art.by * k, br = 86 * k;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx, by, br * 1.08, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(0, by - br, 0, by + br);
      g.addColorStop(0, '#ff6b73'); g.addColorStop(1, '#d81e2c');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      outlinedText(ctx, String(BOOSTER_START[what]), bx, by + br * 0.04, br * 1.15, '#ffffff', '#7a0a18');
    }
    return;
  }
  if (what === 'slot') { boosterIcon(ctx, what, x, y, s * 0.36); return; }
  // a bus is drawn symmetric about its centre (roof above, face below): centre it in the tile,
  // nudged right a little to balance its shadow falling down-left
  if (what === 'hidden') { const w = s * 0.4; drawBus(ctx, 0, 1, true, x + w * 0.08, y, w, L.dpr); roofNumber(0, x + w * 0.08, y, w, 1, true); return; }
  if (what === 'link') {
    const w = s * 0.28;
    for (const dx of [-1, 1]) drawBus(ctx, dx < 0 ? 5 : 3, 1, false, x + dx * s * 0.2 + w * 0.08, y, w, L.dpr);
    ctx.strokeStyle = '#6b3d14';
    ctx.lineWidth = s * 0.045;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - s * 0.13, y - s * 0.12); ctx.quadraticCurveTo(x, y - s * 0.02, x + s * 0.17, y - s * 0.12); ctx.stroke();
    return;
  }
  if (what === 'lock') {
    // a padlocked bus, and the key its passenger carries
    const w = s * 0.36;
    drawBus(ctx, 5, 1, false, x - s * 0.1 + w * 0.08, y + s * 0.02, w, L.dpr);
    drawPadlock(ctx, x - s * 0.1 + w * 0.08, y + roofOffset(w, 1) + s * 0.02, w * 0.48);
    drawKey(ctx, x + s * 0.22, y - s * 0.16, s * 0.3, -0.7);
    return;
  }
  if (what === 'frozen') {
    const w = s * 0.4;
    drawBus(ctx, 5, 1, false, x + w * 0.08, y, w, L.dpr);
    ctx.fillStyle = 'rgba(200, 240, 255, 0.85)';
    roundRect(ctx, x - w * 0.55, y - w * 0.85, w * 1.2, w * 1.55, w * 0.22); ctx.fill();
    ctx.fillStyle = '#1f6fd6';
    ctx.beginPath(); ctx.arc(x + w * 0.05, y - w * 0.15, w * 0.32, 0, Math.PI * 2); ctx.fill();
    outlinedText(ctx, '3', x + w * 0.05, y - w * 0.14, w * 0.4, '#ffffff', '#0b3a80');
    return;
  }
  if (what === 'tunnel') {
    // a stretch of road with a clay tunnel over it and a bus going in
    ctx.fillStyle = pal().surf[0];
    roundRect(ctx, x - s * 0.36, y - s * 0.1, s * 0.72, s * 0.2, s * 0.08); ctx.fill();
    drawBus(ctx, 3, 1, false, x - s * 0.26, y + s * 0.02, s * 0.2, L.dpr, 0);
    ctx.fillStyle = '#c87a2e';
    roundRect(ctx, x - s * 0.08, y - s * 0.12, s * 0.42, s * 0.3, s * 0.08); ctx.fill();
    ctx.fillStyle = '#f2a957';
    roundRect(ctx, x - s * 0.08, y - s * 0.17, s * 0.42, s * 0.28, s * 0.08); ctx.fill();
    ctx.fillStyle = '#6b3a12';
    ctx.beginPath(); ctx.arc(x - s * 0.08, y + s * 0.02, s * 0.1, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
    outlinedText(ctx, '→', x + s * 0.13, y - s * 0.04, s * 0.18, '#d98a3c', '#a85a12');
    return;
  }
  // four passengers: a figure stands below its head, so lift the group to centre heads and bodies
  const c = s * 0.24;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bx = x + dx * c * 0.55, by = y - c * 0.45 + dy * c * 0.55;
    drawMarble(dx < 0 ? 4 : 6, bx, by, c);
    if (what === 'ice') drawIce(ctx, bx, by, c * 0.96, 0);
  }
}

function cardRect(h: number): Rect {
  const w = Math.min(L.cw * 0.88, L.u * 0.86);
  return { x: L.w / 2 - w / 2, y: L.h / 2 - h / 2 + L.u * 0.03, w, h };
}

function popIn(t: number): number {
  const k = Math.min(1, t / 0.32);
  // starts at exactly 0, which rounding can push a hair below: never a negative size
  return k < 1 ? Math.max(0, 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2)) : 1;
}

function drawOverlay(o: Overlay): void {
  const { u } = L;
  buttons = [];
  if (o.kind === 'home') { drawHome(o.t); return; }
  if (o.kind === 'album') { drawAlbum(o); return; }
  if (o.kind === 'settings') { drawSettings(o); return; }
  if (o.kind === 'loading') { drawLoading(o.t); return; }
  ctx.fillStyle = `rgba(20, 15, 60, ${Math.min(0.62, o.t * 2.5)})`;
  ctx.fillRect(0, 0, L.w, L.h);
  const k = popIn(o.t);
  ctx.save();
  ctx.translate(L.w / 2, L.h / 2);
  ctx.scale(k, k);
  ctx.translate(-L.w / 2, -L.h / 2);
  if (o.kind === 'hard') {
    // "Hard Level!" / "Super Hard!": a tilted ribbon with flames, then the level opens
    const sup = o.tier === 'super';
    const cy = L.h * 0.42, w = Math.min(L.cw * 0.92, u * 0.9), h = u * 0.2;
    for (const sx of [-1, 1]) {
      // flames either side
      const fx = L.w / 2 + sx * w * 0.36, fy = cy - h * 0.9;
      const fl = Math.sin(clock * 12 + sx) * u * 0.008;
      for (const [r, c] of [[0.09, sup ? '#b02cff' : '#ff4a1a'], [0.06, sup ? '#e08aff' : '#ffb21a'], [0.03, '#fff3a0']] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(fx, fy - u * r * 2.2 - fl);
        ctx.quadraticCurveTo(fx + u * r * 1.2, fy - u * r * 0.4, fx, fy + u * r);
        ctx.quadraticCurveTo(fx - u * r * 1.2, fy - u * r * 0.4, fx, fy - u * r * 2.2 - fl);
        ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(L.w / 2, cy);
    ctx.rotate(-0.05);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, -w / 2, -h / 2 + u * 0.015, w, h, h * 0.3); ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, sup ? '#c56bff' : '#ff6b5a');
    g.addColorStop(1, sup ? '#6a17c4' : '#c4102e');
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, -w / 2 - u * 0.012, -h / 2 - u * 0.012, w + u * 0.024, h + u * 0.024, h * 0.32); ctx.fill();
    ctx.fillStyle = g;
    roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, -w / 2 + h * 0.2, -h / 2 + h * 0.1, w - h * 0.4, h * 0.25, h * 0.12); ctx.fill();
    outlinedText(ctx, sup ? 'Super Hard!' : 'Hard Level!', 0, 0, h * 0.55, '#fff36b', sup ? '#2e0a5c' : '#5c0a14');
    ctx.restore();
    outlinedText(ctx, sup ? 'The toughest jam yet. Plan every bus!' : 'Watch the road: the end gets tricky!', L.w / 2, cy + h * 0.95, u * 0.042, '#ffffff', INK);
    outlinedText(ctx, 'Tap to start', L.w / 2, cy + h * 1.6, u * 0.034, 'rgba(255,255,255,0.8)', INK);
  } else if (o.kind === 'intro') {
    const r = cardRect(u * 0.95);
    const info = INTRO[o.what];
    const isBooster = o.what === 'slot' || o.what === 'magnet' || o.what === 'broom' || o.what === 'shuffle';
    popupCard(ctx, r, isBooster ? `New: ${info.title}` : info.title, u, false);
    // the bar's boosters bring their own round frame; the rest sit on a tile
    if (!(o.what === 'broom' || o.what === 'shuffle' || o.what === 'magnet')) iconTile(ctx, L.w / 2, r.y + u * 0.33, u * 0.36);
    drawIntroIcon(o.what, L.w / 2, r.y + u * 0.33, u * 0.4);
    infoBox(ctx, { x: r.x + u * 0.06, y: r.y + u * 0.56, w: r.w - u * 0.12, h: u * 0.15 }, info.lines, u * 0.036);
    const b: Rect = { x: L.w / 2 - r.w * 0.32, y: r.y + r.h - u * 0.19, w: r.w * 0.64, h: u * 0.12 };
    pillButton(ctx, b, 'Got it!');
    buttons.push({ id: 'intro', r: b });
  } else if (o.kind === 'revive') {
    const r = cardRect(u * 1.0);
    const close = popupCard(ctx, r, 'Traffic Jam!', u);
    outlinedText(ctx, sim.progress(total) >= 70 ? 'So close! Keep going?' : 'The road is jammed!', L.w / 2, r.y + u * 0.14, u * 0.045, '#ffd21f', INK);
    const ty = r.y + u * 0.36, ts = u * 0.28;
    iconTile(ctx, L.w / 2 - u * 0.19, ty, ts);
    boosterIcon(ctx, 'slot', L.w / 2 - u * 0.19, ty, ts * 0.36);
    iconTile(ctx, L.w / 2 + u * 0.19, ty, ts);
    boosterIcon(ctx, 'broom', L.w / 2 + u * 0.19, ty, ts * 0.36);
    outlinedText(ctx, '+', L.w / 2, ty, u * 0.08, '#ffd21f', '#9a5a00');
    infoBox(ctx, { x: r.x + u * 0.06, y: r.y + u * 0.55, w: r.w - u * 0.12, h: u * 0.15 }, ['Revive: every bus on the road', 'fills up with its passengers!'], u * 0.035);
    const b: Rect = { x: L.w / 2 - r.w * 0.36, y: r.y + r.h - u * 0.2, w: r.w * 0.72, h: u * 0.12 };
    pillButton(ctx, b, o.busy ? '…' : FalconSDK.ads.enabled ? 'Revive' : 'Revive Free', 'green', FalconSDK.ads.enabled);
    buttons.push({ id: 'revive', r: b });
    if (close) buttons.push({ id: 'giveup', r: close });
  } else if (o.kind === 'fail') {
    const cy = L.h * 0.42;
    ribbon(ctx, L.w / 2, cy - u * 0.42, Math.min(L.cw * 0.8, u * 0.8), u * 0.15, 'Level Failed', 'purple');
    drawMascot(ctx, L.w / 2, cy - u * 0.08, u * 0.42, -1, clock);
    // speech bubble
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, L.w / 2 + u * 0.16, cy - u * 0.33, u * 0.26, u * 0.1, u * 0.04); ctx.fill();
    ctx.fillStyle = '#26305f';
    ctx.font = `800 ${u * 0.026}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Try again!', L.w / 2 + u * 0.29, cy - u * 0.295);
    ctx.fillText('You got this!', L.w / 2 + u * 0.29, cy - u * 0.26);
    const pct = sim.progress(total);
    const bw = Math.min(L.cw * 0.7, u * 0.62), by = cy + u * 0.3;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, L.w / 2 - bw / 2 - 3, by - 3, bw + 6, u * 0.05 + 6, u * 0.03); ctx.fill();
    ctx.fillStyle = '#c9cfe6';
    roundRect(ctx, L.w / 2 - bw / 2, by, bw, u * 0.05, u * 0.025); ctx.fill();
    ctx.fillStyle = '#4fd23a';
    roundRect(ctx, L.w / 2 - bw / 2, by, Math.max(u * 0.05, (bw * pct) / 100), u * 0.05, u * 0.025); ctx.fill();
    outlinedText(ctx, `${pct}%`, L.w / 2, by + u * 0.025, u * 0.035, '#ffffff', INK);
    outlinedText(ctx, 'of the picture collected', L.w / 2, by - u * 0.035, u * 0.032, '#ffffff', INK);
    const b: Rect = { x: L.w / 2 - u * 0.25, y: by + u * 0.12, w: u * 0.5, h: u * 0.13 };
    pillButton(ctx, b, 'Retry');
    buttons.push({ id: 'retry', r: b });
  } else if (o.kind === 'win') {
    // the reference's clear screen: a burst of light, the gold "Level Complete!" ribbon,
    // the finished picture on a white card, coins tumbling past it
    const pic = PICTURES[level % PICTURES.length];
    const cw = Math.min(L.cw * 0.66, u * 0.62);
    const cx = L.w / 2, cy = L.h * 0.44;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(o.t * 0.25);
    for (let k = 0; k < 14; k++) {
      ctx.rotate((Math.PI * 2) / 14);
      ctx.fillStyle = 'rgba(255, 226, 120, 0.16)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-u * 0.09, -u * 0.9); ctx.lineTo(u * 0.09, -u * 0.9); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const glow = ctx.createRadialGradient(cx, cy, cw * 0.2, cx, cy, cw * 0.95);
    glow.addColorStop(0, 'rgba(255, 236, 150, 0.45)');
    glow.addColorStop(1, 'rgba(255, 236, 150, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - cw, cy - cw, cw * 2, cw * 2);
    // the card
    const x0 = cx - cw / 2, y0 = cy - cw / 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    roundRect(ctx, x0 + 4, y0 + 8, cw, cw, u * 0.03); ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x0 - 6, y0 - 6, cw + 12, cw + 12, u * 0.035); ctx.fill();
    ctx.fillStyle = '#e9eef8';
    roundRect(ctx, x0, y0, cw, cw, u * 0.025); ctx.fill();
    const k = Math.min(1, o.t / 1.0);
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0 + cw * (1 - k), cw, cw * k + 1); ctx.clip();
    ctx.drawImage(winPicture(level, cw - u * 0.03), x0 + u * 0.015, y0 + u * 0.015, cw - u * 0.03, cw - u * 0.03);
    ctx.restore();
    ribbon(ctx, cx, y0 - u * 0.12, Math.min(L.cw * 0.86, u * 0.8), u * 0.15, 'Level Complete!', 'gold');
    outlinedText(ctx, pic.name, cx, y0 + cw + u * 0.07, u * 0.05, '#fff36b', INK);
    // coins tumbling down past the card
    for (let i = 0; i < 9; i++) {
      const t = o.t - i * 0.12;
      if (t < 0) continue;
      const fx = cx + Math.sin(i * 2.3) * cw * 0.12, fy = y0 - u * 0.1 + t * u * 0.9 + Math.sin(t * 5 + i) * u * 0.01;
      if (fy > y0 + cw + u * 0.1) continue; // they stop short of the Next Level button
      const r = u * 0.042, sq = Math.abs(Math.cos(t * 4 + i));
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(0.35 + 0.65 * sq, 1);
      ctx.fillStyle = '#b86a00';
      ctx.beginPath(); ctx.arc(0, r * 0.12, r, 0, Math.PI * 2); ctx.fill();
      const cg = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
      cg.addColorStop(0, '#fff3a0');
      cg.addColorStop(1, '#f2a510');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d58a00';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
      // a little bus on the coin: body, two windows, wheels
      ctx.fillStyle = '#c47800';
      roundRect(ctx, -r * 0.38, -r * 0.34, r * 0.76, r * 0.56, r * 0.14); ctx.fill();
      ctx.fillStyle = '#ffe48a';
      roundRect(ctx, -r * 0.28, -r * 0.25, r * 0.24, r * 0.2, r * 0.05); ctx.fill();
      roundRect(ctx, r * 0.04, -r * 0.25, r * 0.24, r * 0.2, r * 0.05); ctx.fill();
      ctx.fillStyle = '#c47800';
      ctx.beginPath(); ctx.arc(-r * 0.2, r * 0.28, r * 0.1, 0, Math.PI * 2); ctx.arc(r * 0.2, r * 0.28, r * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // Next Level: straight into the next level (shows once the picture has filled in)
    if (o.t > 0.8) {
      const bw = Math.min(L.cw * 0.62, u * 0.6), bh = u * 0.13;
      const b: Rect = { x: cx - bw / 2, y: y0 + cw + u * 0.15, w: bw, h: bh };
      ctx.globalAlpha = Math.min(1, (o.t - 0.8) * 4);
      pillButton(ctx, b, level + 1 >= LEVEL_COUNT ? 'Play Again' : 'Next Level', 'green');
      ctx.globalAlpha = 1;
      buttons.push({ id: 'next', r: b });
    }
  }
  ctx.restore();
}

/**
 * The home screen: the illustrated bus stop (src/assets/home.jpg), its top bar and buttons
 * in place. The picture carries the art of the gear, the lives and coin pills, the Level
 * button, the streak badge and the Collection button; the live numbers are painted over the
 * picture's own ones, on the same colours, so they read as part of it. Coordinates are in
 * the picture's 852 × 1846 design space, mapped like CSS "cover" into the phone column.
 */
/** Home: the bus cut from the picture (eyes' irises painted out) and its two irises, built once the picture loads. */
let homeBus: { c: HTMLCanvasElement; irises: HTMLCanvasElement[] } | null = null;
const HB = { x0: 200, y0: 685, x1: 835, y1: 1180, eyes: [[600, 925], [715, 925]] as [number, number][], ir: 32,
  /** the eye whites: centre and radii */
  whites: [[598, 928, 45, 51], [720, 928, 42, 50]] as [number, number, number, number][] };
function buildHomeBus(): void {
  if (homeBus || !homeImg.complete || !homeImg.naturalWidth) return;
  const k = homeImg.naturalWidth / 852;
  const c = document.createElement('canvas');
  c.width = Math.round((HB.x1 - HB.x0) * k); c.height = Math.round((HB.y1 - HB.y0) * k);
  const g = c.getContext('2d')!;
  g.drawImage(homeImg, HB.x0 * k, HB.y0 * k, c.width, c.height, 0, 0, c.width, c.height);
  const irises = HB.eyes.map(([ex, ey]) => {
    const r = HB.ir * k, ic = document.createElement('canvas');
    ic.width = ic.height = Math.ceil(r * 2);
    const ig = ic.getContext('2d')!;
    ig.drawImage(homeImg, (ex - HB.ir) * k, (ey - HB.ir) * k, r * 2, r * 2, 0, 0, r * 2, r * 2);
    // a soft round edge: the iris without the white round it
    ig.globalCompositeOperation = 'destination-in';
    const m = ig.createRadialGradient(r, r, r * 0.78, r, r, r * 0.95);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    ig.fillStyle = m; ig.fillRect(0, 0, r * 2, r * 2);
    // paint the iris out of the bus with the eye's own white (warm on top, shaded below), soft edged
    const cx = (ex - HB.x0) * k, cy = (ey - HB.y0) * k;
    // stay inside the eye's white (its outline is part of the picture) and fade out at the edge
    const [wx, wy, rx, ry] = HB.whites[HB.eyes.findIndex((q) => q[0] === ex)];
    g.save();
    g.beginPath(); g.ellipse((wx - HB.x0) * k, (wy - HB.y0) * k, rx * k, ry * k, 0, 0, Math.PI * 2); g.clip();
    const wg = g.createLinearGradient(0, cy - r, 0, cy + r);
    wg.addColorStop(0, '#fbded3'); wg.addColorStop(0.55, '#f0cdc3'); wg.addColorStop(1, '#dbb0a8');
    const off = document.createElement('canvas');
    off.width = off.height = Math.ceil(r * 2.4);
    const og = off.getContext('2d')!;
    og.fillStyle = wg; og.translate(r * 1.2 - cx, r * 1.2 - cy); og.fillRect(cx - r * 1.2, cy - r * 1.2, r * 2.4, r * 2.4);
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.globalCompositeOperation = 'destination-in';
    const fm = og.createRadialGradient(r * 1.2, r * 1.2, r * 0.95, r * 1.2, r * 1.2, r * 1.18);
    fm.addColorStop(0, 'rgba(0,0,0,1)'); fm.addColorStop(1, 'rgba(0,0,0,0)');
    og.fillStyle = fm; og.fillRect(0, 0, off.width, off.height);
    g.drawImage(off, cx - r * 1.2, cy - r * 1.2);
    g.restore();
    return ic;
  });
  homeBus = { c, irises };
}

/**
 * The home screen: the illustrated bus stop (src/assets/home.jpg). Its gear, lives and coin
 * pills, Level button, streak badge and Collection button are part of the picture; the live
 * numbers are painted over the picture's own ones on the same colours. The bus idles (a fine
 * engine shake) and looks left and right. Coordinates in the picture's 852 × 1846 space.
 */
function drawHome(t: number): void {
  void t;
  const W0 = 852, H0 = 1846;
  ctx.fillStyle = '#1a1036';
  ctx.fillRect(0, 0, L.w, L.h);
  const s = Math.max(L.cw / W0, L.h / H0);
  const ox = L.cx0 + (L.cw - W0 * s) / 2, oy = (L.h - H0 * s) / 2;
  const P = (x: number, y: number): Pt => ({ x: ox + x * s, y: oy + y * s });
  ctx.save();
  ctx.beginPath(); ctx.rect(L.cx0, 0, L.cw, L.h); ctx.clip();
  if (homeImg.complete && homeImg.naturalWidth) ctx.drawImage(homeImg, ox, oy, W0 * s, H0 * s);
  buildHomeBus();
  if (homeBus) {
    // the idling engine: a quick, tiny stretch anchored on the wheels (never smaller than the picture under it)
    const shake = 1;
    const bx = P(HB.x0, HB.y0), bw = (HB.x1 - HB.x0) * s, bh = (HB.y1 - HB.y0) * s;
    const ax = bx.x + bw / 2, ay = bx.y + bh;
    ctx.save();
    ctx.translate(ax, ay); ctx.scale(1 + (shake - 1) * 0.5, shake); ctx.translate(-ax, -ay);
    ctx.drawImage(homeBus.c, bx.x, bx.y, bw, bh);
    // the eyes look left, ahead, right… with a soft ease and a pause at each side
    const ph = (clock % 6) / 6;
    const look = ph < 0.2 ? 0 : ph < 0.3 ? -(ph - 0.2) / 0.1 : ph < 0.5 ? -1 : ph < 0.6 ? -1 + (ph - 0.5) / 0.1 : ph < 0.7 ? (ph - 0.6) / 0.1 : ph < 0.9 ? 1 : 1 - (ph - 0.9) / 0.1;
    const e = look * Math.abs(look) * 0.5 + look * 0.5;
    HB.eyes.forEach(([ex, ey], k) => {
      const c = P(ex + e * 8, ey + Math.abs(e) * 1.2), r = HB.ir * s;
      ctx.drawImage(homeBus!.irises[k], c.x - r, c.y - r, r * 2, r * 2);
    });
    ctx.restore();
  }
  const patch = (x0: number, y0: number, x1: number, y1: number, fill: string | CanvasGradient, r = 0.5): void => {
    const a = P(x0, y0), b = P(x1, y1);
    ctx.fillStyle = fill;
    roundRect(ctx, a.x, a.y, b.x - a.x, b.y - a.y, (b.y - a.y) * r); ctx.fill();
  };
  const brown = '#a8401a';
  const lives = FalconSDK.lives, on = lives.enabled;
  const count = on ? lives.count : 5, full = on ? lives.isFull : true;
  const hc = P(205, 168);
  ctx.fillStyle = '#fc3c72';
  ctx.beginPath(); ctx.arc(hc.x, hc.y, 19 * s, 0, Math.PI * 2); ctx.fill();
  outlinedText(ctx, String(count), hc.x, hc.y + 2 * s, 46 * s, '#ffffff', '#c41e43');
  patch(250, 146, 352, 190, '#fce6cc');
  ctx.font = `900 ${40 * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = brown;
  let q = P(300, 170);
  ctx.fillText(full ? 'Full' : lives.countdown(), q.x, q.y);
  patch(508, 146, 598, 190, '#fce3c9');
  q = P(553, 170);
  ctx.fillStyle = brown;
  ctx.fillText(String(coins), q.x, q.y);
  const gb = P(0, 1450), ge = P(0, 1512);
  const gg = ctx.createLinearGradient(0, gb.y, 0, ge.y);
  gg.addColorStop(0, '#7dd200'); gg.addColorStop(1, '#4ad100');
  patch(290, 1450, 566, 1512, gg, 0.3);
  q = P(428, 1481);
  outlinedText(ctx, `Level ${level + 1}`, q.x, q.y, 72 * s, '#ffffff', '#1d4a0a');
  const sg = ctx.createLinearGradient(0, P(0, 1385).y, 0, P(0, 1418).y);
  sg.addColorStop(0, '#be7ffc'); sg.addColorStop(1, '#a25dfb');
  patch(552, 1384, 680, 1419, sg, 0.45);
  q = P(616, 1401);
  outlinedText(ctx, streak > 0 ? `${streak} Win Streak` : 'Win Streak', q.x, q.y, 27 * s, '#ffffff', '#5a1d9a');
  ctx.restore();
  const box = (id: string, x0: number, y0: number, x1: number, y1: number): void => { const a = P(x0, y0), b = P(x1, y1); buttons.push({ id, r: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } }); };
  box('play', 196, 1403, 657, 1561);
  box('album', 690, 1415, 825, 1560);
  box('homeGear', 25, 108, 142, 225);
  box('homeLives', 170, 135, 405, 200);
  box('homeCoins', 430, 135, 652, 200);
}

/**
 * The collection (album) popup, on the illustrated reference (src/assets/collection.jpg): its top
 * bar, blue panel, title, close button and progress bar come from the picture; the grid area is
 * cleared to the panel's cream and holds every level as a card in the picture's style (bead
 * thumbnail, green tick, "No.N Name"; a grey "?" card until the level is cleared). It scrolls by
 * drag or wheel. Coordinates in the picture's 941 × 1672 design space, "cover" in the column.
 */
/**
 * Settings: sound, music and vibration switches, Clear Progress (asks once more before it wipes
 * the cleared levels, coins, streak, tutorials and boosters and starts again from level 1), and
 * Home when opened from a level. Over the home screen or the level, dimmed.
 */
/** The settings popup cut out of its picture (src/assets/settings.jpg, 1137 × 1383): panel, title plaque and decorations. */
let settingsCut: HTMLCanvasElement | null = null;
function buildSettingsCut(): void {
  if (settingsCut || !settingsImg.complete || !settingsImg.naturalWidth) return;
  const k = settingsImg.naturalWidth / 1137;
  const c = document.createElement('canvas');
  c.width = settingsImg.naturalWidth; c.height = settingsImg.naturalHeight;
  const g = c.getContext('2d')!;
  // the shape: the panel, the title plaque, and round patches over each decoration (soft edged)
  g.filter = `blur(${Math.max(1, 5 * k)}px)`;
  g.fillStyle = '#000';
  roundRect(g, 92 * k, 255 * k, 958 * k, 990 * k, 46 * k); g.fill();
  roundRect(g, 345 * k, 128 * k, 470 * k, 190 * k, 40 * k); g.fill();
  for (const [x, y, r] of [[335, 135, 85], [235, 195, 85], [885, 160, 105], [1012, 272, 64], [115, 1150, 98], [1000, 1175, 82], [560, 1225, 60]]) {
    g.beginPath(); g.arc(x * k, y * k, r * k, 0, Math.PI * 2); g.fill();
  }
  g.filter = 'none';
  g.globalCompositeOperation = 'source-in';
  g.drawImage(settingsImg, 0, 0);
  settingsCut = c;
}

/**
 * Settings, in the reference's Halloween popup: Sound / Music / Vibration switches (painted over
 * the picture's own), Clear Progress (asks once more before it wipes the save and starts again
 * from level 1) and Home. Over the home screen or the level, dimmed.
 */
function drawSettings(o: Extract<Overlay, { kind: 'settings' }>): void {
  if (o.from === 'home') drawHome(o.t);
  buttons = [];
  ctx.fillStyle = `rgba(20, 12, 45, ${Math.min(0.62, o.t * 2.5)})`;
  ctx.fillRect(0, 0, L.w, L.h);
  buildSettingsCut();
  const W0 = 1137, H0 = 1383;
  const s = Math.min((L.cw * 0.98) / W0, (L.h * 0.78) / H0);
  const k = popIn(o.t);
  ctx.save();
  ctx.translate(L.w / 2, L.h / 2); ctx.scale(k, k); ctx.translate(-L.w / 2, -L.h / 2);
  const ox = L.w / 2 - (W0 * s) / 2, oy = L.h / 2 - (H0 * s) / 2;
  const P = (x: number, y: number): Pt => ({ x: ox + x * s, y: oy + y * s });
  if (settingsCut) ctx.drawImage(settingsCut, ox, oy, W0 * s, H0 * s);
  // the switches, live
  const keys: ('sound' | 'music' | 'haptic')[] = ['sound', 'music', 'haptic'];
  keys.forEach((key, i) => {
    const cy = [445, 617, 790][i], c = P(863, cy);
    const on = audio.get(key), sw = 190 * s, sh = 88 * s;
    ctx.fillStyle = '#fdeac9';
    roundRect(ctx, c.x - sw / 2 - 8 * s, c.y - sh / 2 - 8 * s, sw + 16 * s, sh + 18 * s, (sh + 16 * s) / 2); ctx.fill();
    ctx.fillStyle = on ? '#0f7a2c' : '#6b6e80';
    roundRect(ctx, c.x - sw / 2, c.y - sh / 2 + 5 * s, sw, sh, sh / 2); ctx.fill();
    const g = ctx.createLinearGradient(0, c.y - sh / 2, 0, c.y + sh / 2);
    g.addColorStop(0, on ? '#4fd85a' : '#c3c6d3'); g.addColorStop(1, on ? '#1aa13a' : '#9598ab');
    ctx.fillStyle = g;
    roundRect(ctx, c.x - sw / 2, c.y - sh / 2, sw, sh, sh / 2); ctx.fill();
    outlinedText(ctx, on ? 'ON' : 'OFF', c.x + (on ? -0.2 : 0.2) * sw, c.y + 2 * s, 40 * s, '#ffffff', on ? '#0d5a22' : '#4d5062');
    const kx = on ? c.x + sw / 2 - sh / 2 : c.x - sw / 2 + sh / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.arc(kx, c.y + 4 * s, sh * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(kx, c.y, sh * 0.4, 0, Math.PI * 2); ctx.fill();
    const a = P(155, cy - 72), b = P(1005, cy + 72);
    buttons.push({ id: `set:${key}`, r: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } });
  });
  // Clear Progress asks once more
  if (o.confirm > 0) {
    const a = P(400, 918), b = P(840, 1002);
    const g = ctx.createLinearGradient(0, a.y, 0, b.y);
    g.addColorStop(0, '#ffa424'); g.addColorStop(1, '#ff7a06');
    ctx.fillStyle = g;
    roundRect(ctx, a.x, a.y, b.x - a.x, b.y - a.y, (b.y - a.y) * 0.3); ctx.fill();
    const t = P(620, 962);
    outlinedText(ctx, 'Tap again to clear!', t.x, t.y, 52 * s, '#ffffff', '#8a2a00');
  }
  ctx.restore();
  const box = (id: string, x0: number, y0: number, x1: number, y1: number): void => {
    // the popup is drawn popped in: hit areas at its resting size
    const a = P(x0, y0), b = P(x1, y1); buttons.push({ id, r: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } });
  };
  box('setClear', 214, 890, 928, 1031);
  box('setHome', 214, 1055, 928, 1200);
  box('setClose', 950, 210, 1078, 336);
}

/** The loading screen between a level and home: the illustrated title (src/assets/loading.jpg) and a filling bar. */
const LOADING = 1.5;
function drawLoading(t: number): void {
  const W0 = 942, H0 = 1670;
  ctx.fillStyle = '#1a1036';
  ctx.fillRect(0, 0, L.w, L.h);
  const s = Math.max(L.cw / W0, L.h / H0);
  const ox = L.cx0 + (L.cw - W0 * s) / 2, oy = (L.h - H0 * s) / 2;
  const P = (x: number, y: number): Pt => ({ x: ox + x * s, y: oy + y * s });
  ctx.save();
  ctx.beginPath(); ctx.rect(L.cx0, 0, L.cw, L.h); ctx.clip();
  if (loadingImg.complete && loadingImg.naturalWidth) ctx.drawImage(loadingImg, ox, oy, W0 * s, H0 * s);
  const a = P(250, 1500), b = P(692, 1534), h = b.y - a.y;
  ctx.fillStyle = 'rgba(30, 12, 50, 0.75)';
  roundRect(ctx, a.x - 4, a.y - 4, b.x - a.x + 8, h + 8, (h + 8) / 2); ctx.fill();
  const k = Math.min(1, t / (LOADING * 0.92)), e = 1 - Math.pow(1 - k, 2);
  const g = ctx.createLinearGradient(0, a.y, 0, b.y);
  g.addColorStop(0, '#ffd166'); g.addColorStop(1, '#ff8a1e');
  ctx.fillStyle = g;
  roundRect(ctx, a.x, a.y, Math.max(h, (b.x - a.x) * e), h, h / 2); ctx.fill();
  ctx.restore();
}


/** Wipe the player's progress and start again from level 1. */
function clearProgress(): void {
  album = []; coins = 0; streak = 0; seenIntros = [];
  for (const kk of Object.keys(boosterCounts) as BoosterKey[]) boosterCounts[kk] = BOOSTER_START[kk];
  FalconSDK.userData.set({ album: [], coins: 0, streak: 0, intros: [], boosters: { ...boosterCounts } });
  firstStart = true;
  startLevel(0);
  showToast('Progress cleared');
}

/** Collection decorations cut from its picture with a soft oval edge (so a sprite drawn a little bigger blends in). */
const ALBUM_DECO = { ghost: [118, 132, 266, 228], bus: [128, 205, 302, 342], pumpkin: [40, 250, 158, 364] } as const;
let albumDeco: Record<keyof typeof ALBUM_DECO, HTMLCanvasElement> | null = null;
function buildAlbumDeco(): void {
  if (albumDeco || !albumImg.complete || !albumImg.naturalWidth) return;
  const k = albumImg.naturalWidth / 941;
  const cut = ([x0, y0, x1, y1]: readonly number[]): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = Math.round((x1 - x0) * k); c.height = Math.round((y1 - y0) * k);
    const g = c.getContext('2d')!;
    g.drawImage(albumImg, x0 * k, y0 * k, c.width, c.height, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    // an oval fade: solid in the middle, clear at the rectangle's edges
    g.translate(c.width / 2, c.height / 2);
    g.scale(1, c.height / c.width);
    const m = g.createRadialGradient(0, 0, c.width * 0.3, 0, 0, c.width * 0.5);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(-c.width, -c.width, c.width * 2, c.width * 2);
    return c;
  };
  albumDeco = { ghost: cut(ALBUM_DECO.ghost), bus: cut(ALBUM_DECO.bus), pumpkin: cut(ALBUM_DECO.pumpkin) };
}

/**
 * The collection (album) popup, on the illustrated Halloween reference (src/assets/collection.jpg):
 * top bar, purple panel, title, decorations, close button and progress bar come from the picture;
 * the grid area is cleared to the panel's cream and holds every level as a card in the picture's
 * style. The ghost floats, the bus bounces, the pumpkin and candles glow. Scrolls by drag or wheel.
 * Coordinates in the picture's 941 × 1671 space, fitted to the column's width.
 */
function drawAlbum(o: Extract<Overlay, { kind: 'album' }>): void {
  const W0 = 941, H0 = 1671;
  ctx.fillStyle = '#1a1036';
  ctx.fillRect(0, 0, L.w, L.h);
  const s = Math.min(L.cw / W0, L.h / H0);
  const ox = L.cx0 + (L.cw - W0 * s) / 2, oy = Math.max(0, Math.min((L.h - H0 * s) / 2, L.top * 0.6));
  if (homeImg.complete && homeImg.naturalWidth) {
    const hs = Math.max(L.cw / 852, L.h / 1846);
    ctx.save(); ctx.beginPath(); ctx.rect(L.cx0, 0, L.cw, L.h); ctx.clip();
    ctx.filter = 'blur(6px)';
    ctx.drawImage(homeImg, L.cx0 + (L.cw - 852 * hs) / 2, (L.h - 1846 * hs) / 2, 852 * hs, 1846 * hs);
    ctx.restore();
  }
  const P = (x: number, y: number): Pt => ({ x: ox + x * s, y: oy + y * s });
  ctx.save();
  ctx.beginPath(); ctx.rect(L.cx0, 0, L.cw, L.h); ctx.clip();
  if (albumImg.complete && albumImg.naturalWidth) ctx.drawImage(albumImg, ox, oy, W0 * s, H0 * s);
  // the decorations come alive (sprites only ever drawn a little bigger than the picture under them)
  buildAlbumDeco();
  if (albumDeco) {
    const deco = (key: keyof typeof ALBUM_DECO, sx: number, sy: number, ax: number, ay: number): void => {
      const [x0, y0, x1, y1] = ALBUM_DECO[key];
      const a = P(x0, y0), w = (x1 - x0) * s, h = (y1 - y0) * s;
      const px0 = a.x + w * ax, py0 = a.y + h * ay;
      ctx.save(); ctx.translate(px0, py0); ctx.scale(sx, sy); ctx.translate(-px0, -py0);
      ctx.drawImage(albumDeco![key], a.x, a.y, w, h);
      ctx.restore();
    };
    // the ghost breathes and drifts up, the bus bounces on its wheels, the pumpkin pulses
    deco('ghost', 1.02 + 0.03 * Math.sin(clock * 2.2), 1.03 + 0.05 * (0.5 + 0.5 * Math.sin(clock * 2.2)), 0.5, 1);
    const hop = Math.max(0, Math.sin(clock * 5));
    deco('bus', 1.01 + 0.02 * hop, 1.01 + 0.05 * hop, 0.5, 1);
    deco('pumpkin', 1.02 + 0.025 * (0.5 + 0.5 * Math.sin(clock * 3)), 1.02 + 0.025 * (0.5 + 0.5 * Math.sin(clock * 3)), 0.5, 0.75);
    // warm glows: the pumpkin's face and the two candles
    const glow = (x: number, y: number, r: number, a: number): void => {
      const c = P(x, y), g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * s);
      g.addColorStop(0, `rgba(255, 190, 70, ${a})`); g.addColorStop(1, 'rgba(255, 150, 40, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y, r * s, 0, Math.PI * 2); ctx.fill();
    };
    ctx.globalCompositeOperation = 'lighter';
    glow(98, 318, 52, 0.18 + 0.1 * Math.sin(clock * 4));
    glow(762, 285, 22, 0.25 + 0.15 * Math.sin(clock * 13));
    glow(788, 275, 24, 0.25 + 0.15 * Math.sin(clock * 11 + 1));
    ctx.globalCompositeOperation = 'source-over';
    // a few twinkles round the title
    for (let k = 0; k < 5; k++) {
      const ph = (clock * 0.6 + k * 0.37) % 1;
      if (ph > 0.35) continue;
      const tw = Math.sin((ph / 0.35) * Math.PI), c = P(330 + ((k * 137) % 430), 200 + ((k * 61) % 90));
      const r = 9 * s * tw;
      ctx.fillStyle = `rgba(255, 245, 190, ${tw})`;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - r); ctx.lineTo(c.x + r * 0.25, c.y - r * 0.25); ctx.lineTo(c.x + r, c.y); ctx.lineTo(c.x + r * 0.25, c.y + r * 0.25);
      ctx.lineTo(c.x, c.y + r); ctx.lineTo(c.x - r * 0.25, c.y + r * 0.25); ctx.lineTo(c.x - r, c.y); ctx.lineTo(c.x - r * 0.25, c.y - r * 0.25);
      ctx.closePath(); ctx.fill();
    }
  }
  const patch = (x0: number, y0: number, x1: number, y1: number, fill: string | CanvasGradient, r = 0.5): void => {
    const a = P(x0, y0), b = P(x1, y1);
    ctx.fillStyle = fill;
    roundRect(ctx, a.x, a.y, b.x - a.x, b.y - a.y, Math.min(b.x - a.x, b.y - a.y) * r); ctx.fill();
  };
  const lives = FalconSDK.lives, on = lives.enabled;
  const hc = P(250, 86);
  ctx.fillStyle = '#fe3886';
  ctx.beginPath(); ctx.arc(hc.x, hc.y, 21 * s, 0, Math.PI * 2); ctx.fill();
  outlinedText(ctx, String(on ? lives.count : 5), hc.x, hc.y + 2 * s, 50 * s, '#ffffff', '#c41e43');
  patch(310, 66, 400, 108, '#fef2dc');
  patch(625, 66, 712, 108, '#fef0dc');
  ctx.font = `900 ${42 * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#a8401a';
  let q = P(354, 88); ctx.fillText(!on || lives.isFull ? 'Full' : lives.countdown(), q.x, q.y);
  q = P(667, 88); ctx.fillText(String(coins), q.x, q.y);
  // progress: cleared / all
  const bl = P(262, 327), br = P(682, 373);
  ctx.fillStyle = '#462c73';
  roundRect(ctx, bl.x, bl.y, br.x - bl.x, br.y - bl.y, (br.y - bl.y) / 2); ctx.fill();
  const k = album.length / LEVEL_COUNT;
  if (k > 0) {
    const gg = ctx.createLinearGradient(0, bl.y, 0, br.y);
    gg.addColorStop(0, '#8ef07f'); gg.addColorStop(1, '#3fc63c');
    ctx.fillStyle = gg;
    roundRect(ctx, bl.x, bl.y, Math.max(br.y - bl.y, (br.x - bl.x) * k), br.y - bl.y, (br.y - bl.y) / 2); ctx.fill();
  }
  q = P(472, 350);
  ctx.font = `900 ${34 * s}px ${FONT}`;
  const t1 = String(album.length), t2 = `/${LEVEL_COUNT}`, w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width;
  outlinedText(ctx, t1, q.x - w2 / 2, q.y, 34 * s, '#ffe14d', '#2a1550');
  outlinedText(ctx, t2, q.x + w1 / 2, q.y, 34 * s, '#ffffff', '#2a1550');
  // the grid area, cleared to the panel's cream
  const g0 = P(64, 396), g1 = P(878, 1572);
  ctx.fillStyle = '#feeccc';
  ctx.fillRect(g0.x, g0.y, g1.x - g0.x, g1.y - g0.y);
  const pitchY = 227 * s, cardW = 252 * s, cardH = 213 * s;
  const rowsN = Math.ceil(LEVEL_COUNT / 3);
  const maxScroll = Math.max(0, rowsN * pitchY + 24 * s - (g1.y - g0.y));
  o.scroll = Math.max(0, Math.min(maxScroll, o.scroll));
  ctx.save();
  ctx.beginPath(); ctx.rect(g0.x, g0.y, g1.x - g0.x, g1.y - g0.y); ctx.clip();
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const cx = P([203, 474, 742][i % 3], 0).x, top = P(0, 410).y + Math.floor(i / 3) * pitchY - o.scroll;
    if (top > g1.y || top + cardH < g0.y) continue;
    const x0 = cx - cardW / 2, got = album.includes(i);
    ctx.fillStyle = 'rgba(160, 110, 60, 0.25)';
    roundRect(ctx, x0, top + 5 * s, cardW, cardH, 22 * s); ctx.fill();
    ctx.fillStyle = got ? '#f9e1bf' : '#f4ece0';
    roundRect(ctx, x0, top, cardW, cardH, 22 * s); ctx.fill();
    ctx.fillStyle = got ? '#fff0d9' : '#fbf6ee';
    roundRect(ctx, x0 + 6 * s, top + 6 * s, cardW - 12 * s, cardH - 12 * s, 18 * s); ctx.fill();
    const px0 = x0 + 12 * s, py0 = top + 12 * s, pw = cardW - 24 * s, ph = 160 * s;
    ctx.save();
    roundRect(ctx, px0, py0, pw, ph, 14 * s); ctx.clip();
    if (got) {
      const img = winPicture(i, pw);
      const crop = (img.width * (1 - ph / pw)) / 2;
      ctx.drawImage(img, 0, crop, img.width, img.height - crop * 2, px0, py0, pw, ph);
    } else {
      ctx.fillStyle = '#a3add2';
      ctx.fillRect(px0, py0, pw, ph);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(px0, py0, pw, ph * 0.12);
      ctx.font = `900 ${ph * 0.66}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#8592c4';
      ctx.fillText('?', cx, py0 + ph * 0.54);
    }
    ctx.restore();
    if (got) {
      const ck = { x: x0 + cardW - 30 * s, y: top + 26 * s }, r = 24 * s;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ck.x, ck.y, r + 3 * s, 0, Math.PI * 2); ctx.fill();
      const cg = ctx.createLinearGradient(0, ck.y - r, 0, ck.y + r);
      cg.addColorStop(0, '#5fe35a'); cg.addColorStop(1, '#1fa82c');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(ck.x, ck.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(ck.x - r * 0.45, ck.y); ctx.lineTo(ck.x - r * 0.1, ck.y + r * 0.35); ctx.lineTo(ck.x + r * 0.48, ck.y - r * 0.32); ctx.stroke();
    }
    ctx.font = `800 ${22 * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5a3416';
    ctx.fillText(`No.${i + 1} ${PICTURES[i % PICTURES.length].name}`, cx, top + 191 * s, cardW - 12 * s);
  }
  ctx.restore();
  ctx.restore();
  const box = (id: string, x0: number, y0: number, x1: number, y1: number): void => { const a = P(x0, y0), b = P(x1, y1); buttons.push({ id, r: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } }); };
  box('albumClose', 815, 250, 930, 365);
  box('albumHome', 38, 20, 165, 145);
}

async function onButton(id: string): Promise<void> {
  const o = overlay;
  if (!o) return;
  sfx.click();
  if (id === 'intro' && o.kind === 'intro') {
    seenIntros.push(o.what);
    FalconSDK.userData.set({ intros: [...seenIntros] });
    // a newly unlocked booster comes with its starter units
    overlay = null;
    coach = coachFor(o.what);
    coachT = 0;
  } else if (id === 'revive' && o.kind === 'revive') {
    if (o.busy) return;
    o.busy = true;
    const ok = FalconSDK.ads.enabled ? await FalconSDK.ads.showRewarded() : true;
    if (overlay !== o) return;
    o.busy = false;
    if (!ok) { showToast('Ad not available, try again'); return; }
    overlay = null;
    revives++;
    state = 'playing';
    // every bus on the road fills up with its colour from the board and drives off
    apply(sim.reviveFill());
    sfx.merge();
    sfx.booster();
    float('Revived!', L.w / 2, px(0, sim.geo.ym).y - L.u * 0.08, L.u * 0.07, '#ffffff', '#16842a', 1.3);
  } else if (id === 'giveup' && o.kind === 'revive') {
    overlay = { kind: 'fail', t: 0 };
  } else if (id === 'retry' && o.kind === 'fail') {
    overlay = null;
    state = 'over';
    // The round really ends here: close the analytics turn, then start fresh.
    streak = 0;
    FalconSDK.userData.set({ streak });
    events.emit('lose', { canRevive: false });
    startLevel(level);
  } else if (id === 'next' && o.kind === 'win') {
    overlay = null;
    startLevel(level + 1 >= LEVEL_COUNT ? level : level + 1);
  } else if (id === 'play' && o.kind === 'home') {
    overlay = afterHome;
    afterHome = null;
  } else if (id === 'homeGear' && o.kind === 'home') {
    overlay = { kind: 'settings', t: 0, from: 'home', confirm: 0 };
  } else if (id.startsWith('set:') && o.kind === 'settings') {
    const key = id.slice(4) as 'sound' | 'music' | 'haptic';
    audio.set(key, !audio.get(key));
  } else if (id === 'setClose' && o.kind === 'settings') {
    overlay = o.from === 'home' ? { kind: 'home', t: 1 } : null;
  } else if (id === 'setHome' && o.kind === 'settings') {
    overlay = o.from === 'home' ? { kind: 'home', t: 1 } : { kind: 'loading', t: 0 };
  } else if (id === 'setClear' && o.kind === 'settings') {
    if (o.confirm > 0) clearProgress();
    else o.confirm = 3;
  } else if (id === 'homeCoins' && o.kind === 'home') {
    if (FalconSDK.shop.isEnabled()) FalconSDK.shop.open();
    else showToast('Win levels to earn coins!');
  } else if (id === 'homeLives' && o.kind === 'home') {
    showToast(FalconSDK.lives.enabled && !FalconSDK.lives.isFull ? `Next life in ${FalconSDK.lives.countdown()}` : 'Lives are full!');
  } else if (id === 'album') {
    overlay = { kind: 'album', t: 0, scroll: 0, from: o.kind === 'home' ? 'home' : 'game' };
  } else if (id === 'shop') {
    FalconSDK.shop.open();
  } else if (id === 'albumHome' && o.kind === 'album') {
    overlay = { kind: 'loading', t: 0 };
  } else if (id === 'albumClose' && o.kind === 'album') {
    overlay = o.from === 'home' ? { kind: 'home', t: 1 } : null;
  }
}

// ---------------------------------------------------------------- input

function toLocal(e: { clientX: number; clientY: number }): Pt {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/** The bus on the road under p (for the Magnet), or -1. */
function roadBusAt(p: Pt): number {
  let best = -1, bd = L.bw * 1.1;
  for (const s of sim.buses) {
    if ((s.where !== 'road' && s.where !== 'enter') || s.cap <= 0) continue;
    const b = vb.get(s.id)!;
    const d = Math.hypot(p.x - b.x, p.y - (b.y - L.bw * 0.3));
    if (d < bd) { bd = d; best = s.id; }
  }
  return best;
}

function busAt(p: Pt): number {
  let best = -1, bd = Infinity;
  for (const s of sim.buses) {
    if (s.where !== 'lot') continue;
    const b = vb.get(s.id)!;
    if (b.y > L.h) continue;
    const pitch = (sim.geo.rowH * L.cs) / 2;
    const dx = Math.abs(p.x - b.x), dy = Math.abs(p.y - b.y);
    if (dx < L.bw * 0.75 && dy < pitch && dx + dy < bd) { bd = dx + dy; best = s.id; }
  }
  return best;
}

let drag: { y: number; scroll: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  const p = toLocal(e);
  if (devPrompt) { const n = devPrompt.next; devPrompt = null; startLevel(n); return; }
  if (overlay) {
    if (overlay.kind === 'album') drag = { y: p.y, scroll: overlay.scroll };
    if (overlay.kind === 'hard') { if (overlay.t > 0.5) closeHard(); return; }
    if (press) return;
    const hit = buttons.find((b) => inside(b.r, p.x, p.y));
    if (hit) {
      // the button dips and springs back, then acts
      pressAt(hit.r);
      if (hit.id.startsWith('set:')) void onButton(hit.id);
      else setTimeout(() => { void onButton(hit.id); }, 130);
    }
    return;
  }
  if (gathering()) return;
  if (Math.hypot(p.x - L.homeX, p.y - L.homeY) < L.homeR * 1.3) { sfx.click(); pressAt({ x: L.homeX - L.homeR, y: L.homeY - L.homeR, w: L.homeR * 2, h: L.homeR * 2 }); overlay = { kind: 'settings', t: 0, from: 'game', confirm: 0 }; armed = null; return; }
  if (Math.hypot(p.x - L.speedX, p.y - L.speedY) < L.speedR * 1.4) { speedIdx = (speedIdx + 1) % SPEEDS.length; sfx.click(); return; }
  if (coach.length && coachT > 0.5 && (inside(slotPlus, p.x, p.y) || boosterSpots.some((s) => Math.hypot(p.x - s.x, p.y - s.y) < s.r * 1.3))) { coach.shift(); coachT = 0; }
  if (inside(slotPlus, p.x, p.y)) { void useBooster('slot'); return; }
  for (const s of boosterSpots) if (Math.abs(p.x - s.x) < s.r * 1.1 && p.y > s.y - s.r * 1.1 && p.y < s.y + s.r * 1.5) { void useBooster(s.key); return; }
  if (tutorial === 1 || tutorial === 3) { tutorial = -1; }
  if (coach.length && coachT > 0.5) { coach.shift(); coachT = 0; }
  if (armed === 'magnet' && canPlay()) {
    const rid = roadBusAt(p);
    if (rid >= 0) magnetBus(rid);
    return;
  }
  const id = busAt(p);
  if (id >= 0) tapBus(id);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || overlay?.kind !== 'album') return;
  overlay.scroll = drag.scroll - (toLocal(e).y - drag.y);
});
window.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { if (overlay?.kind === 'album') overlay.scroll += e.deltaY; }, { passive: true });

window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (overlay) {
    if (e.key === 'Enter' || e.key === ' ') { const b = buttons[0]; if (b) void onButton(b.id); e.preventDefault(); }
    if (e.key === 'Escape') { const close = buttons.find((b) => b.id === 'giveup' || b.id === 'albumClose' || b.id === 'play'); if (close) void onButton(close.id); }
    return;
  }
  if (devPrompt && (e.key === 'Enter' || e.key === ' ')) { const n = devPrompt.next; devPrompt = null; startLevel(n); return; }
  if (gathering()) return;
  const n = Number(e.key);
  if (n >= 1 && n <= spec.cols) {
    const col = sim.columns[n - 1];
    if (col.length) tapBus(col[0]);
  } else if (e.key === 'q') void useBooster('broom');
  else if (e.key === 'w') void useBooster('shuffle');
  else if (e.key === 'e') void useBooster('magnet');
  else if (e.key === 'r') void useBooster('slot');
  else if (e.key === 'f') speedIdx = (speedIdx + 1) % SPEEDS.length;
  else if (e.key === 'Escape') armed = null;
});

window.addEventListener('resize', layout);

// Without the studio layer (npm run dev / Preview) nothing answers a win: offer a plain next level.
if (import.meta.env.DEV) {
  // Test hooks for headless runs.
  const rnd = mulberry32(99);
  (window as unknown as { __bus: object }).__bus = {
    /** Tap the bus the bot would pick; returns its id or -1. */
    step(): number {
      if (!canPlay()) return -1;
      const id = botPick(sim, rnd);
      if (id >= 0) tapBus(id);
      return id;
    },
    tap: (id: number) => tapBus(id),
    perf: () => { const r = { ...perf }; perf.sim = perf.crowd = perf.buses = perf.frames = 0; return r; },
    /** Open an overlay directly (screenshots). */
    /** DEV: pretend the first n levels are cleared (album screenshots). */
    seedAlbum: (n: number) => { album = [...Array(n).keys()]; },
    /** DEV: the Magnet's pick on the first bus on the road. */
    pickRoad: () => { const b = sim.onRoad().find((x) => x.where === 'road' && x.cap > 0); if (b && armed === 'magnet') magnetBus(b.id); return b ? b.id : -1; },
    show(kind: 'revive' | 'fail' | 'win' | 'home' | 'album'): void {
      if (kind === 'revive') { state = 'lost'; overlay = { kind, t: 0, busy: false }; }
      else if (kind === 'fail') { state = 'lost'; overlay = { kind, t: 0 }; }
      else if (kind === 'win') { state = 'won'; winT = 1; overlay = { kind, t: 0 }; }
      else if (kind === 'home') overlay = { kind, t: 0 };
      else overlay = { kind, t: 0, scroll: 0, from: 'game' };
    },
    /** Play the level out with the bot (fast); resolves with the end state. */
    async auto(maxSec = 120): Promise<string> {
      speedIdx = SPEEDS.length - 1;
      const t0 = performance.now();
      while (performance.now() - t0 < maxSec * 1000) {
        if (state !== 'playing') return state;
        if (canPlay()) { const id = botPick(sim, rnd); if (id >= 0) tapBus(id); }
        await new Promise((r) => setTimeout(r, 150));
      }
      return state;
    },
    button: (id: string) => onButton(id),
    booster: (k: BoosterKey) => useBooster(k),
    info: () => ({
      level, state, overlay: overlay?.kind ?? null, dev: !!devPrompt, slots: sim.slots, road: sim.onRoad().length,
      lot: sim.inLot().length, units: sim.totalUnits(), total, progress: sim.progress(total), tutorial, speed: speedMul(),
      counts: { ...boosterCounts }, armed, buttons: buttons.map((b) => b.id), album: album.length,
      fronts: sim.fronts().map((f) => ({ id: f.id, ...busPos(f.id), color: f.color, cap: f.cap })),
    }),
  };
}

layout();
requestAnimationFrame(frame);

/** What the studio layer attaches to. See falcon-game.ts for every member. */
export const game: FalconGame = {
  getLevelCount: () => LEVEL_COUNT,
  startLevel,
  on: events.on,
  pause: () => { paused = true; },
  resume: () => { paused = false; },
  getProgress: () => sim.progress(total),
  audio,
};

// Everything drawn with code, in the look of the reference: glossy bead balls,
// a periwinkle road with a navy median and white curbs, chunky front-view toy
// buses with the load on the roof, a yellow mascot bus with big eyes.

export const FONT = "'Lilita One','Luckiest Guy','Arial Rounded MT Bold','Trebuchet MS',system-ui,sans-serif";

/** Ball / bus colours, indexed like COLOR_KEYS ('ROYGCBPKWDNS'). */
export const HEX = ['#f13e48', '#ff852b', '#ffd21a', '#39cc7b', '#36c9f2', '#0b8bf6', '#a8a0f0', '#ff7ac8', '#eef2fb', '#2c2b31', '#9a5a2b', '#f7b98c'];
export const NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink', 'White', 'Black', 'Brown', 'Peach'];

export const ROAD_FILL = '#a3a9db';
export const ROAD_DARK = '#4b5290';
export const CURB = '#f4f5ff';
export const INK = '#1f2a5c';

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, stroke: string, align: CanvasTextAlign = 'center'): void {
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, size * 0.24);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------- balls

const ballCache = new Map<string, HTMLCanvasElement>();

/**
 * A marble as the reference draws them, pre-rendered at `px` device pixels:
 * big enough to touch its neighbours (no ground between them), a soft body lit
 * from the upper left, no dark rim, a small highlight. The marble fills 94 % of
 * the sprite.
 */
export function ballSprite(color: number, px: number): HTMLCanvasElement {
  const key = `${color}:${px}`;
  let c = ballCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  const hex = HEX[color];
  const m = px / 2, r = px * 0.47;
  const white = color === 8, dark = color === 9;
  // a faint contact shadow just below
  g.fillStyle = 'rgba(40, 35, 90, 0.16)';
  g.beginPath(); g.ellipse(m, m + r * 0.1, r, r * 0.97, 0, 0, Math.PI * 2); g.fill();
  const body = g.createRadialGradient(m - r * 0.3, m - r * 0.36, r * 0.08, m, m, r);
  if (white) {
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.55, '#eef3fb');
    body.addColorStop(0.88, '#d3dcee');
    body.addColorStop(1, '#bcc7e0');
  } else {
    body.addColorStop(0, shade(hex, dark ? 0.22 : 0.32));
    body.addColorStop(0.55, shade(hex, dark ? 0.02 : 0.03));
    body.addColorStop(0.88, shade(hex, dark ? -0.22 : -0.16));
    body.addColorStop(1, shade(hex, dark ? -0.4 : -0.3));
  }
  g.fillStyle = body;
  g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill();
  // a small soft highlight
  g.fillStyle = white ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)';
  g.beginPath(); g.ellipse(m - r * 0.3, m - r * 0.38, r * 0.17, r * 0.11, -0.6, 0, Math.PI * 2); g.fill();
  ballCache.set(key, c);
  return c;
}

/** An ice cube round a marble: translucent, with a lit top bevel and a glint. */
export function drawIce(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, crack: number): void {
  const h = s * 0.56;
  ctx.fillStyle = 'rgba(120, 170, 220, 0.45)';
  roundRect(ctx, x - h, y - h + s * 0.08, h * 2, h * 2, s * 0.22); ctx.fill();
  const g = ctx.createLinearGradient(0, y - h, 0, y + h);
  g.addColorStop(0, 'rgba(240, 250, 255, 0.78)');
  g.addColorStop(1, 'rgba(170, 215, 250, 0.55)');
  ctx.fillStyle = g;
  roundRect(ctx, x - h, y - h, h * 2, h * 2, s * 0.22); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(1, s * 0.08);
  roundRect(ctx, x - h * 0.82, y - h * 0.82, h * 1.64, h * 1.64, s * 0.16); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(x - h * 0.45, y - h * 0.5, h * 0.28, h * 0.14, -0.6, 0, Math.PI * 2); ctx.fill();
  if (crack > 0) {
    ctx.strokeStyle = 'rgba(60,110,170,0.8)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath(); ctx.moveTo(x - s * 0.1, y - s * 0.4); ctx.lineTo(x + s * 0.05, y - s * 0.05); ctx.lineTo(x - s * 0.15, y + s * 0.2); ctx.stroke();
  }
}

/** A chunky wooden crate: a dark side under a lit top, planks, metal corners when tough. */
export function drawCrate(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, hp: number): void {
  const h = s * 0.55, d = s * 0.16;
  ctx.fillStyle = 'rgba(60, 30, 10, 0.35)';
  roundRect(ctx, x - h + d * 0.4, y - h + d * 1.4, h * 2, h * 2, s * 0.16); ctx.fill();
  ctx.fillStyle = '#7a4214';
  roundRect(ctx, x - h, y - h + d, h * 2, h * 2, s * 0.16); ctx.fill();
  const g = ctx.createLinearGradient(0, y - h, 0, y + h);
  g.addColorStop(0, '#ffcf7a');
  g.addColorStop(1, '#d48a36');
  ctx.fillStyle = g;
  roundRect(ctx, x - h, y - h, h * 2, h * 2, s * 0.16); ctx.fill();
  ctx.strokeStyle = '#8a4f18';
  ctx.lineWidth = Math.max(1, s * 0.1);
  roundRect(ctx, x - h * 0.78, y - h * 0.78, h * 1.56, h * 1.56, s * 0.08); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - h * 0.7, y + h * 0.7); ctx.lineTo(x + h * 0.7, y - h * 0.7); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath(); ctx.moveTo(x - h * 0.9, y - h * 0.5); ctx.lineTo(x - h * 0.9, y - h * 0.9); ctx.lineTo(x - h * 0.5, y - h * 0.9); ctx.stroke();
  if (hp > 1) {
    ctx.fillStyle = '#9aa0b8';
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(x + dx * h * 0.72, y + dy * h * 0.72, s * 0.1, 0, Math.PI * 2); ctx.fill(); }
  }
}

// ---------------------------------------------------------------- cars (3/4 view)
//
// Chunky toy vans seen from above and a little from the bottom of the screen,
// like the reference: a glossy roof carrying the load number, the face turned
// towards the viewer (windscreen + yellow lights, rear window + red lights, or
// side windows), side mirrors, a dark outline. Merged buses stand taller
// with a row of windows per deck.

const LINE = '#262836';

/** Car length for a given width: a toy bus a little longer than wide, as in the reference. */
export const carLen = (w: number): number => w * 1.5;

/** The camera looks down at a slant: depth on the ground shows this much shorter on screen. */
const TILT = 0.65;

/** How tall the box stands on screen (decks stack up for merged buses). */
const carHeight = (w: number, tiers: number): number => w * 0.53 * (1 + 0.4 * (tiers - 1));

/** Where the load number sits relative to the car's centre (screen px): high on the roof, as in the reference. */
export const roofOffset = (w: number, tiers: number): number => -carHeight(w, tiers) / 2 - w * 0.16;

function bodyHex(color: number, hidden: boolean): string {
  if (hidden) return '#a3a9c6';
  if (color === 8) return '#f3f4fa';
  if (color === 9) return '#34363f';
  return HEX[color];
}

interface V2 { x: number; y: number }

/** A rounded rectangle on the ground turned to `ang`, centred on (cx, cy), seen through the slanted camera (depth × TILT), as a path on ctx. */
function turnedRect(ctx: CanvasRenderingContext2D, cx: number, cy: number, len: number, wid: number, r: number, ang: number): void {
  const c = Math.cos(ang), s = Math.sin(ang);
  const P = (u: number, v: number): V2 => ({ x: cx + u * c - v * s, y: cy + (u * s + v * c) * TILT });
  const hl = len / 2, hw = wid / 2;
  r = Math.min(r, hl, hw);
  ctx.beginPath();
  const pts: [number, number, number][] = [[hl - r, -hw + r, -Math.PI / 2], [hl - r, hw - r, 0], [-hl + r, hw - r, Math.PI / 2], [-hl + r, -hw + r, Math.PI]];
  for (const [u, v, a0] of pts) {
    for (let k = 0; k <= 4; k++) {
      const a = a0 + (k / 4) * (Math.PI / 2);
      const p = P(u + Math.cos(a) * r, v + Math.sin(a) * r);
      if (k === 0 && u === hl - r && v === -hw + r) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
  }
  ctx.closePath();
}

/**
 * Draw a car whose centre is (x, y), heading `head` (radians; -π/2 = up the
 * screen), as the reference draws them: a chunky box seen from above and a
 * little from the front of the screen — the roof on top (the load number sits
 * there), the face turned towards the viewer below it: windscreen and yellow
 * headlights when the car comes down the screen, rear window and red lights
 * when it drives up, a row of windows when it drives across. `tiers` > 1 makes
 * it a taller double- or triple-decker.
 */
const busCache = new Map<string, { c: HTMLCanvasElement; half: number }>();
/** Steps of heading the cached bus pictures come in (a full turn). */
const HEADINGS = 64;

/** Forget the cached bus pictures (sizes change with the layout). */
export function clearBusCache(): void { busCache.clear(); }

/**
 * Draw a bus (see drawBusShape) from a cache of pre-rendered pictures: one per colour,
 * deck count, size and heading (in HEADINGS steps), so a frame costs one drawImage per bus
 * instead of rebuilding dozens of paths.
 */
export function drawBus(ctx: CanvasRenderingContext2D, color: number, tiers: number, hidden: boolean, x: number, y: number, w: number, dpr: number, head = -Math.PI / 2, scale = 1): void {
  if (scale <= 0) return;
  const q = ((Math.round((head / (Math.PI * 2)) * HEADINGS) % HEADINGS) + HEADINGS) % HEADINGS;
  const px = Math.max(4, Math.round(w * dpr));
  const key = `${color}|${tiers}|${hidden ? 1 : 0}|${px}|${q}`;
  let e = busCache.get(key);
  if (!e) {
    const ww = px / dpr;
    const half = ww * 1.7 * (tiers > 1 ? 1.25 : 1);
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(half * 2 * dpr);
    const g = c.getContext('2d')!;
    g.scale(dpr, dpr);
    drawBusShape(g, color, tiers, hidden, half, half, ww, dpr, (q / HEADINGS) * Math.PI * 2, 1);
    e = { c, half };
    busCache.set(key, e);
  }
  const k = (w / (px / dpr)) * scale, h = e.half * k;
  ctx.drawImage(e.c, x - h, y - h, h * 2, h * 2);
}

export function drawBusShape(ctx: CanvasRenderingContext2D, color: number, tiers: number, hidden: boolean, x: number, y: number, w: number, _dpr: number, head = -Math.PI / 2, scale = 1): void {
  w *= scale;
  const len = carLen(w) * (tiers > 1 ? 1.12 : 1);
  const hgt = carHeight(w, tiers);
  const r = w * 0.3;
  const hex = bodyHex(color, hidden);
  const gy = y + hgt / 2, ry = y - hgt / 2;
  const c = Math.cos(head), s = Math.sin(head);
  const lw = Math.max(1, w * 0.045);
  // a soft shadow on the ground, down and to the left (as the reference lights it)
  for (const [k, a] of [[1.16, 0.1], [1.06, 0.14], [0.96, 0.18]] as const) {
    ctx.fillStyle = `rgba(30, 20, 75, ${a})`;
    turnedRect(ctx, x - w * 0.24, gy + w * 0.1, len * k, w * k, r * k, head);
    ctx.fill();
  }
  // the body: the outline, then the sides swept from the ground up to the roof
  ctx.fillStyle = LINE;
  for (const dy of [hgt, 0]) { turnedRect(ctx, x, gy - dy, len + lw * 2, w + lw * 2, r + lw, head); ctx.fill(); }
  const steps = Math.max(3, Math.min(10, Math.ceil(hgt / 2)));
  const sideCol = shade(hex, color === 9 ? 0.05 : -0.2);
  for (let k = 0; k <= steps; k++) {
    ctx.fillStyle = k === 0 ? LINE : sideCol;
    turnedRect(ctx, x, gy - (hgt * k) / steps, len + (k === 0 ? lw * 2 : 0), w + (k === 0 ? lw * 2 : 0), r + (k === 0 ? lw : 0), head);
    ctx.fill();
  }
  // the faces turned towards the viewer: affine quads A→B along the ground, up by hgt
  const face = (ax: number, ay: number, bx: number, by: number, paint: (q: (u: number, v: number) => V2) => void): void => {
    const q = (u: number, v: number): V2 => ({ x: ax + (bx - ax) * u, y: ay + (by - ay) * u - hgt * v });
    paint(q);
  };
  const quad = (q: (u: number, v: number) => V2, u0: number, u1: number, v0: number, v1: number, fill: string): void => {
    const a = q(u0, v0), b = q(u1, v0), d = q(u1, v1), e = q(u0, v1);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(e.x, e.y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  };
  const dot = (q: (u: number, v: number) => V2, u: number, v: number, rr: number, fill: string): void => {
    const p = q(u, v);
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rr, rr * 0.8, 0, 0, Math.PI * 2); ctx.fill();
  };
  const ground = (u: number, v: number): V2 => ({ x: x + u * c - v * s, y: gy + (u * s + v * c) * TILT });
  const decks = Math.max(1, tiers);
  const glass = (q: (u: number, v: number) => V2, u0: number, u1: number, v0: number, v1: number): void => {
    quad(q, u0 - 0.03, u1 + 0.03, v0 - 0.05 / decks, v1 + 0.05 / decks, LINE);
    quad(q, u0, u1, v0, v1, '#9fd2f2');
    quad(q, u0 + (u1 - u0) * 0.08, u0 + (u1 - u0) * 0.3, v0 + (v1 - v0) * 0.15, v1 - (v1 - v0) * 0.12, 'rgba(255,255,255,0.55)');
  };
  // front (headlights) or back, whichever end faces down the screen
  const ends: [number, boolean][] = [[1, true], [-1, false]];
  for (const [sgn, front] of ends) {
    if (s * sgn <= 0.12) continue;
    const a = ground((sgn * len) / 2, (-sgn * w) / 2 * 0.86), b = ground((sgn * len) / 2, (sgn * w) / 2 * 0.86);
    const k = Math.min(1, (s * sgn - 0.12) * 2.5);
    ctx.globalAlpha = k;
    face(a.x, a.y, b.x, b.y, (q) => {
      quad(q, 0.04, 0.96, 0.02, 0.98, shade(hex, color === 9 ? 0.06 : color === 8 ? -0.03 : -0.05));
      // a darker bumper along the bottom
      quad(q, 0.04, 0.96, 0.02, 0.1 / decks, shade(hex, color === 9 ? 0.16 : -0.24));
      // a wide windscreen high on the face, as the reference draws it
      for (let d = 0; d < decks; d++) glass(q, 0.13, 0.87, (d + 0.36) / decks, (d + 0.66) / decks);
      // the reference shows the same friendly face (screen + yellow lamps) on whichever end is towards us
      const lamp = '#ffd83a';
      dot(q, 0.19, 0.22 / decks, w * 0.085, LINE);
      dot(q, 0.81, 0.22 / decks, w * 0.085, LINE);
      dot(q, 0.19, 0.22 / decks, w * 0.065, lamp);
      dot(q, 0.81, 0.22 / decks, w * 0.065, lamp);
      quad(q, 0.36, 0.64, 0.17 / decks, 0.3 / decks, shade(hex, front ? -0.35 : -0.25));
    });
    ctx.globalAlpha = 1;
  }
  // the side facing down the screen: windows
  for (const sgn of [1, -1]) {
    const ny = c * sgn; // that side's outward normal (−s, c)·sgn, y part
    if (ny <= 0.2) continue;
    const a = ground((-len / 2) * 0.8, (sgn * w) / 2), b = ground((len / 2) * 0.8, (sgn * w) / 2);
    ctx.globalAlpha = Math.min(1, (ny - 0.2) * 2.5);
    face(a.x, a.y, b.x, b.y, (q) => {
      quad(q, 0, 1, 0.02, 0.98, shade(hex, color === 9 ? 0.04 : -0.14));
      for (let d = 0; d < decks; d++) {
        glass(q, 0.1, 0.44, (d + 0.45) / decks, (d + 0.88) / decks);
        glass(q, 0.56, 0.9, (d + 0.45) / decks, (d + 0.88) / decks);
      }
      // two wheels along the bottom edge
      for (const u of [0.2, 0.8]) {
        dot(q, u, 0.04 / decks, w * 0.15, LINE);
        dot(q, u, 0.04 / decks, w * 0.065, '#c9cbd6');
      }
    });
    ctx.globalAlpha = 1;
  }
  // side mirrors near the front, at roof height, sticking out either side
  for (const sv of [-0.5, 0.5]) {
    const mx = x + 0.3 * len * c - sv * w * s, my = ry + (0.3 * len * s + sv * w * c) * TILT + hgt * 0.1;
    ctx.fillStyle = LINE;
    ctx.beginPath(); ctx.ellipse(mx, my, w * 0.12, w * 0.12, head, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(hex, color === 9 ? 0.1 : -0.25);
    ctx.beginPath(); ctx.ellipse(mx, my, w * 0.075, w * 0.075, head, 0, Math.PI * 2); ctx.fill();
  }
  // the roof: lit from the upper left, a soft rim, a glossy highlight
  turnedRect(ctx, x, ry, len, w, r, head);
  const roof = ctx.createRadialGradient(x - w * 0.25, ry - w * 0.3, w * 0.05, x, ry, w * 0.75);
  roof.addColorStop(0, shade(hex, color === 9 ? 0.32 : 0.4));
  roof.addColorStop(0.6, color === 8 ? '#f6f7fc' : hex);
  roof.addColorStop(1, shade(hex, color === 8 ? -0.08 : -0.18));
  ctx.fillStyle = roof;
  ctx.fill();
  turnedRect(ctx, x, ry, len * 0.78, w * 0.74, r * 0.75, head);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = lw * 0.9;
  ctx.stroke();
  if (tiers > 1) {
    // a double-decker's roof: a lighter panel
    turnedRect(ctx, x, ry, len * 0.6, w * 0.5, r * 0.5, head);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.ellipse(x - w * 0.24, ry - w * 0.22, w * 0.13, w * 0.05, -0.5, 0, Math.PI * 2); ctx.fill();
  if (hidden) {
    turnedRect(ctx, x, ry, len, w, r, head);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
  }
}

// ---------------------------------------------------------------- mascot

/** The yellow bus with a face. mood: 1 happy, 0 calm, -1 sad. */
export function drawMascot(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, mood: number, t = 0): void {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2.4) * s * 0.012);
  const line = '#1b2150';
  const w = s, h = s * 0.92;
  ctx.fillStyle = 'rgba(30, 30, 80, 0.25)';
  ctx.beginPath(); ctx.ellipse(0, h * 0.52, w * 0.55, h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  // wheels
  ctx.fillStyle = '#2b2d3c';
  for (const sx of [-1, 1]) { roundRect(ctx, sx * w * 0.36 - w * 0.08, h * 0.32, w * 0.16, h * 0.2, w * 0.05); ctx.fill(); }
  // roof
  ctx.fillStyle = line;
  roundRect(ctx, -w * 0.4, -h * 0.58, w * 0.8, h * 0.16, w * 0.08); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -w * 0.38, -h * 0.565, w * 0.76, h * 0.13, w * 0.07); ctx.fill();
  // body
  ctx.fillStyle = line;
  roundRect(ctx, -w * 0.5 - 3, -h * 0.47 - 3, w + 6, h * 0.86 + 6, w * 0.16); ctx.fill();
  const g = ctx.createLinearGradient(0, -h * 0.47, 0, h * 0.4);
  g.addColorStop(0, '#ffe45c');
  g.addColorStop(0.7, '#ffc81f');
  g.addColorStop(1, '#e89a00');
  ctx.fillStyle = g;
  roundRect(ctx, -w * 0.5, -h * 0.47, w, h * 0.86, w * 0.15); ctx.fill();
  // sign box
  ctx.fillStyle = '#2b2d3c';
  roundRect(ctx, -w * 0.24, -h * 0.43, w * 0.48, h * 0.08, w * 0.03); ctx.fill();
  // windshield = face
  ctx.fillStyle = line;
  roundRect(ctx, -w * 0.4, -h * 0.32, w * 0.8, h * 0.44, w * 0.1); ctx.fill();
  const fg = ctx.createLinearGradient(0, -h * 0.32, 0, h * 0.12);
  fg.addColorStop(0, '#8fd0ff');
  fg.addColorStop(1, '#3d8fe8');
  ctx.fillStyle = fg;
  roundRect(ctx, -w * 0.38, -h * 0.3, w * 0.76, h * 0.4, w * 0.09); ctx.fill();
  // eyes
  for (const sx of [-1, 1]) {
    const ex = sx * w * 0.15, ey = -h * 0.12;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = line;
    ctx.lineWidth = w * 0.015;
    ctx.beginPath(); ctx.ellipse(ex, ey, w * 0.11, h * 0.13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1d4fb8';
    ctx.beginPath(); ctx.arc(ex + sx * w * 0.01, ey + h * 0.02, w * 0.065, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b1a40';
    ctx.beginPath(); ctx.arc(ex + sx * w * 0.01, ey + h * 0.02, w * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(ex - w * 0.02, ey - h * 0.02, w * 0.022, 0, Math.PI * 2); ctx.fill();
    // brows: raised arcs when happy, inner ends up when sad
    ctx.strokeStyle = line;
    ctx.lineWidth = w * 0.022;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const by = ey - h * 0.19;
    if (mood < 0) {
      ctx.moveTo(ex + sx * w * 0.08, by + h * 0.03);
      ctx.lineTo(ex - sx * w * 0.06, by - h * 0.025);
    } else {
      ctx.moveTo(ex - w * 0.07, by + h * 0.015);
      ctx.quadraticCurveTo(ex, by - h * 0.035, ex + w * 0.07, by + h * 0.015);
    }
    ctx.stroke();
  }
  // mouth
  ctx.strokeStyle = line;
  ctx.lineWidth = w * 0.025;
  ctx.beginPath();
  if (mood > 0) {
    ctx.fillStyle = '#c4243c';
    ctx.moveTo(-w * 0.08, h * 0.04);
    ctx.quadraticCurveTo(0, h * 0.16, w * 0.08, h * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (mood < 0) {
    ctx.moveTo(-w * 0.06, h * 0.09);
    ctx.quadraticCurveTo(0, h * 0.02, w * 0.06, h * 0.09);
    ctx.stroke();
  } else {
    ctx.moveTo(-w * 0.06, h * 0.06);
    ctx.quadraticCurveTo(0, h * 0.1, w * 0.06, h * 0.06);
    ctx.stroke();
  }
  // headlights + bumper
  for (const sx of [-1, 1]) {
    ctx.fillStyle = line;
    ctx.beginPath(); ctx.arc(sx * w * 0.36, h * 0.24, w * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f6ff';
    ctx.beginPath(); ctx.arc(sx * w * 0.36, h * 0.24, w * 0.055, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#2f5fd0';
  roundRect(ctx, -w * 0.52, h * 0.32, w * 1.04, h * 0.09, w * 0.04); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- scenery

export function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = '#8a5a2b';
  roundRect(ctx, x - s * 0.08, y - s * 0.1, s * 0.16, s * 0.4, s * 0.05); ctx.fill();
  ctx.fillStyle = 'rgba(30,60,30,0.2)';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.3, s * 0.4, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  for (const [dx, dy, r, c] of [[0, -0.35, 0.42, '#3e9a2c'], [-0.18, -0.45, 0.3, '#5cc23f'], [0.15, -0.5, 0.26, '#7fd34f'], [-0.05, -0.62, 0.2, '#9ae36a']] as const) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill();
  }
}

/** The page behind everything. */
export function paintBackground(g: CanvasRenderingContext2D, w: number, h: number, colX: number, colW: number): void {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#8fd3ff');
  bg.addColorStop(0.25, '#e9e6f6');
  bg.addColorStop(1, '#d9d5ec');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  // soft grass along both edges of the play column
  g.fillStyle = '#bfe39a';
  g.fillRect(0, h * 0.2, Math.max(0, colX), h);
  g.fillRect(colX + colW, h * 0.2, w, h);
  // dotted texture
  g.fillStyle = 'rgba(120, 110, 180, 0.07)';
  for (let y = 10; y < h; y += 22) for (let x = (y / 22) % 2 ? 0 : 11; x < w; x += 22) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
}

/** The cream board the picture sits on. */
export function paintBoard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.fillStyle = 'rgba(70, 50, 120, 0.22)';
  roundRect(g, x - r * 0.2, y + r * 0.35, w + r * 0.4, h, r * 1.2); g.fill();
  g.fillStyle = '#c99a5b';
  roundRect(g, x - r * 0.5, y - r * 0.5, w + r, h + r, r * 1.3); g.fill();
  g.fillStyle = '#fff2d6';
  roundRect(g, x - r * 0.3, y - r * 0.3, w + r * 0.6, h + r * 0.6, r * 1.1); g.fill();
  g.fillStyle = '#efe2c6';
  roundRect(g, x, y, w, h, r * 0.6); g.fill();
}

/** Small bushes with flowers, for the board's top edge. */
export function bush(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  for (const [dx, r, c] of [[-0.5, 0.42, '#4fb33a'], [0.45, 0.4, '#4fb33a'], [0, 0.55, '#6cc94a']] as const) {
    g.fillStyle = c;
    g.beginPath(); g.arc(x + dx * s, y, r * s, Math.PI, 0); g.fill();
  }
  for (const [dx, dy, c] of [[-0.4, -0.18, '#ff8fb8'], [0.1, -0.35, '#ffffff'], [0.5, -0.12, '#ffd21f']] as const) {
    g.fillStyle = c;
    g.beginPath(); g.arc(x + dx * s, y + dy * s, s * 0.09, 0, Math.PI * 2); g.fill();
  }
}

/** The gate's signal: a pole on a small base with a rounded two-lamp head; `green` lights the lower lamp. */
export function trafficLight(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, green: boolean): void {
  ctx.fillStyle = 'rgba(40, 30, 80, 0.3)';
  ctx.beginPath(); ctx.ellipse(x + s * 0.06, y + s * 0.92, s * 0.22, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8d93ad';
  roundRect(ctx, x - s * 0.17, y + s * 0.78, s * 0.34, s * 0.14, s * 0.06); ctx.fill();
  const pg = ctx.createLinearGradient(x - s * 0.06, 0, x + s * 0.06, 0);
  pg.addColorStop(0, '#d9dcea');
  pg.addColorStop(1, '#8d93ad');
  ctx.fillStyle = pg;
  roundRect(ctx, x - s * 0.055, y - s * 0.1, s * 0.11, s * 0.92, s * 0.05); ctx.fill();
  ctx.fillStyle = '#262836';
  roundRect(ctx, x - s * 0.2, y - s * 0.7, s * 0.4, s * 0.68, s * 0.18); ctx.fill();
  const hg = ctx.createLinearGradient(0, y - s * 0.66, 0, y - s * 0.06);
  hg.addColorStop(0, '#4b4e62');
  hg.addColorStop(1, '#2b2d3a');
  ctx.fillStyle = hg;
  roundRect(ctx, x - s * 0.16, y - s * 0.66, s * 0.32, s * 0.6, s * 0.15); ctx.fill();
  const lamp = (ly: number, on: boolean, col: string, off: string): void => {
    ctx.fillStyle = on ? col : off;
    ctx.beginPath(); ctx.arc(x, ly, s * 0.1, 0, Math.PI * 2); ctx.fill();
    if (on) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - s * 0.03, ly - s * 0.03, s * 0.035, 0, Math.PI * 2); ctx.fill(); }
  };
  lamp(y - s * 0.5, !green, '#ff3d4a', '#5a2a30');
  lamp(y - s * 0.22, green, '#3dff7a', '#1f4a2d');
}

/** Red-white boom barrier: an orange-red control box with the arm hinged on it; `open` 0..1 lifts it. */
export function barrier(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, open: number): void {
  const t = len * 0.12;
  ctx.fillStyle = 'rgba(40, 30, 80, 0.3)';
  ctx.beginPath(); ctx.ellipse(x - len * 0.45, y + t * 1.6, len * 0.5, t * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-open * Math.PI * 0.42);
  ctx.fillStyle = '#7a1020';
  roundRect(ctx, -len - t * 0.15, -t / 2 - t * 0.15, len + t * 0.3, t * 1.3, t * 0.6); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -len, -t / 2, len, t, t / 2); ctx.fill();
  ctx.save();
  roundRect(ctx, -len, -t / 2, len, t, t / 2); ctx.clip();
  ctx.fillStyle = '#ff3b4e';
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    const x0 = -len + k * len * 0.18;
    ctx.moveTo(x0, t / 2); ctx.lineTo(x0 + len * 0.08, -t / 2); ctx.lineTo(x0 + len * 0.16, -t / 2); ctx.lineTo(x0 + len * 0.08, t / 2); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(-len, -t / 2, len, t * 0.3);
  ctx.restore();
  ctx.restore();
  // the control box
  ctx.fillStyle = '#9c2a12';
  roundRect(ctx, x - t * 1.1, y - t * 1.2 + t * 0.3, t * 2.2, t * 2.6, t * 0.6); ctx.fill();
  const bg = ctx.createLinearGradient(0, y - t * 1.2, 0, y + t * 1.2);
  bg.addColorStop(0, '#ff8a4a');
  bg.addColorStop(1, '#e8471f');
  ctx.fillStyle = bg;
  roundRect(ctx, x - t * 1.1, y - t * 1.2, t * 2.2, t * 2.4, t * 0.6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  roundRect(ctx, x - t * 0.8, y - t * 1.0, t * 1.0, t * 0.5, t * 0.25); ctx.fill();
  ctx.fillStyle = '#fff1c2';
  ctx.beginPath(); ctx.arc(x, y, t * 0.35, 0, Math.PI * 2); ctx.fill();
}

/** A puffy cartoon cloud. */
export function cloud(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.fillStyle = 'rgba(120, 170, 220, 0.35)';
  for (const [dx, dy, r] of [[-1, 0.15, 0.6], [0, 0.1, 0.8], [1, 0.15, 0.6]]) { g.beginPath(); g.arc(x + dx * s * 0.9, y + dy * s + s * 0.12, r * s, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffffff';
  for (const [dx, dy, r] of [[-1, 0.15, 0.6], [0, 0, 0.8], [1, 0.15, 0.6], [-0.45, -0.25, 0.55], [0.5, -0.2, 0.5]]) { g.beginPath(); g.arc(x + dx * s * 0.9, y + dy * s, r * s, 0, Math.PI * 2); g.fill(); }
}

/** The corner mascot: a cream puppy peeking down at the board, pink cheeks, floppy brown ears. */
export function drawDog(g: CanvasRenderingContext2D, x: number, y: number, s: number, paws = true): void {
  // soft light-brown outlines and apricot ears, as in the reference
  const line = '#c99868';
  // ears
  for (const sx of [-1, 1]) {
    g.save();
    g.translate(x + sx * s * 0.42, y - s * 0.12);
    g.rotate(sx * 0.5);
    g.fillStyle = line;
    g.beginPath(); g.ellipse(0, s * 0.12, s * 0.2, s * 0.32, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f2b26a';
    g.beginPath(); g.ellipse(0, s * 0.12, s * 0.16, s * 0.28, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // head
  g.fillStyle = line;
  g.beginPath(); g.ellipse(x, y, s * 0.5, s * 0.42, 0, 0, Math.PI * 2); g.fill();
  const hg = g.createRadialGradient(x - s * 0.15, y - s * 0.15, s * 0.05, x, y, s * 0.5);
  hg.addColorStop(0, '#fffaf0');
  hg.addColorStop(1, '#f3dcb8');
  g.fillStyle = hg;
  g.beginPath(); g.ellipse(x, y, s * 0.46, s * 0.38, 0, 0, Math.PI * 2); g.fill();
  // paws on the frame
  if (paws) for (const sx of [-1, 1]) {
    g.fillStyle = line;
    g.beginPath(); g.ellipse(x + sx * s * 0.26, y + s * 0.4, s * 0.15, s * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff6e6';
    g.beginPath(); g.ellipse(x + sx * s * 0.26, y + s * 0.4, s * 0.12, s * 0.075, 0, 0, Math.PI * 2); g.fill();
  }
  // face
  g.fillStyle = '#2b1d14';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * s * 0.17, y - s * 0.02, s * 0.05, s * 0.065, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffffff';
  for (const sx of [-1, 1]) { g.beginPath(); g.arc(x + sx * s * 0.17 - s * 0.015, y - s * 0.045, s * 0.018, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = 'rgba(255, 120, 150, 0.55)';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * s * 0.3, y + s * 0.1, s * 0.08, s * 0.05, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#3a2618';
  g.beginPath(); g.ellipse(x, y + s * 0.08, s * 0.07, s * 0.05, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3a2618';
  g.lineWidth = s * 0.025;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - s * 0.07, y + s * 0.16); g.quadraticCurveTo(x, y + s * 0.21, x + s * 0.07, y + s * 0.16); g.stroke();
}

/** A finished picture as a tiny bead mosaic (album, reveal). */
export function drawPicture(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, w: number, h: number, beads = true): void {
  const W = rows[0].length, H = rows.length;
  const s = Math.min(w / W, h / H);
  const ox = x + (w - s * W) / 2, oy = y + (h - s * H) / 2;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const k = 'ROYGCBPKWDNS'.indexOf(rows[r][c]);
      if (k < 0) continue;
      ctx.fillStyle = HEX[k];
      if (beads) { ctx.beginPath(); ctx.arc(ox + (c + 0.5) * s, oy + (r + 0.5) * s, s * 0.47, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(ox + c * s, oy + r * s, s + 0.5, s + 0.5);
    }
  }
}

// ---------------------------------------------------------------- crowd people

const personCache = new Map<string, HTMLCanvasElement>();

/**
 * A passenger as the reference draws them: a chubby glossy one-colour toy
 * figure seen from a little above and in front — a big round head (over half its
 * height), a plump round belly about as wide as the head, stubby arms hugging
 * the belly, two short legs peeking out below. Lit from the upper left, a soft
 * darker edge all round, a small highlight on the head. The figure stands in a
 * px×px sprite: head centre at (0.5, 0.285), feet at the bottom. `variant` tilts
 * it a little.
 */
/** A passenger sprite covers x PERSON_X0 … PERSON_X0 + PERSON_W of its square cell. */
export const PERSON_X0 = 0.17, PERSON_W = 0.66;

export function personSprite(color: number, variant: number, px: number): HTMLCanvasElement {
  const key = `${color}:${variant % 4}:${px}`;
  let c = personCache.get(key);
  if (c) return c;
  // cropped to the figure's width (x 0.17–0.83 of the cell): less empty sprite to blend per passenger
  c = document.createElement('canvas');
  c.width = Math.ceil(px * PERSON_W);
  c.height = px;
  const g = c.getContext('2d')!;
  g.translate(-px * PERSON_X0, 0);
  g.scale(px, px);
  const base = color === 8 ? '#f1f4fb' : color === 9 ? '#34363f' : HEX[color];
  const lit = shade(base, color === 9 ? 0.3 : color === 8 ? 0.6 : 0.35);
  const dark = color === 8 ? '#b9c3dc' : shade(base, color === 9 ? -0.35 : -0.3);
  const edge = color === 8 ? 'rgba(110, 120, 160, 0.75)' : color === 9 ? 'rgba(5, 5, 10, 0.85)' : shade(base, -0.58);
  g.translate(0.5, 0.95);
  g.rotate(((variant % 4) - 1.5) * 0.03);
  g.translate(-0.5, -0.95);
  const lightFrom = (x: number, y: number, r: number): CanvasGradient => {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.1);
    gr.addColorStop(0, lit);
    gr.addColorStop(0.55, base);
    gr.addColorStop(1, dark);
    return gr;
  };
  const solid = (path: () => void, fill: string | CanvasGradient): void => {
    g.beginPath(); path();
    g.strokeStyle = edge; g.lineWidth = 0.03; g.stroke();
    g.fillStyle = fill; g.fill();
  };
  // a soft contact shadow under the feet
  g.fillStyle = 'rgba(30, 25, 60, 0.28)';
  g.beginPath(); g.ellipse(0.5, 0.95, 0.22, 0.045, 0, 0, Math.PI * 2); g.fill();
  // two stubby legs
  for (const lx of [0.41, 0.59]) solid(() => g.ellipse(lx, 0.87, 0.075, 0.08, 0, 0, Math.PI * 2), lx < 0.5 ? base : dark);
  // the plump round belly
  solid(() => g.ellipse(0.5, 0.65, 0.245, 0.225, 0, 0, Math.PI * 2), lightFrom(0.5, 0.65, 0.25));
  // stubby arms hugging the belly
  for (const sx of [-1, 1]) {
    solid(() => g.ellipse(0.5 + sx * 0.225, 0.66, 0.08, 0.145, sx * 0.3, 0, Math.PI * 2), sx < 0 ? shade(base, color === 8 ? 0.3 : 0.1) : dark);
  }
  // a big round head
  solid(() => g.arc(0.5, 0.285, 0.275, 0, Math.PI * 2), lightFrom(0.5, 0.285, 0.275));
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.beginPath(); g.ellipse(0.4, 0.15, 0.085, 0.05, -0.6, 0, Math.PI * 2); g.fill();
  personCache.set(key, c);
  return c;
}

/** A rounded rectangle as the current path (no beginPath). */
function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const headCache = new Map<string, HTMLCanvasElement>();

/** A crowd figure's head seen from above: a big glossy ball in its colour, a crisp highlight, darker lower edge. */
export function headSprite(color: number, px: number): HTMLCanvasElement {
  const key = `${color}:${px}`;
  let c = headCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  g.scale(px, px);
  const base = color === 8 ? '#eceef6' : color === 9 ? '#3a3c49' : HEX[color];
  const r = 0.46, cx = 0.5, cy = 0.5;
  g.fillStyle = shade(base, color === 8 ? -0.35 : -0.5);
  g.beginPath(); g.arc(cx, cy + 0.02, r, 0, Math.PI * 2); g.fill();
  const hg = g.createRadialGradient(cx - 0.14, cy - 0.16, 0.02, cx, cy, r);
  hg.addColorStop(0, shade(base, color === 9 ? 0.4 : 0.5));
  hg.addColorStop(0.5, base);
  hg.addColorStop(1, shade(base, color === 8 ? -0.2 : -0.3));
  g.fillStyle = hg;
  g.beginPath(); g.arc(cx, cy, r * 0.94, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.beginPath(); g.ellipse(cx - 0.13, cy - 0.17, 0.12, 0.07, -0.6, 0, Math.PI * 2); g.fill();
  headCache.set(key, c);
  return c;
}

// ---------------------------------------------------------------- 3D slabs

/** A rounded rectangle as a Path2D (sub-path; several make a union). */
export function rrPath(p: Path2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}

/**
 * A raised block: drop shadow, a side wall `depth` deep under the top face,
 * then the top face lit by a vertical gradient from y0 to y1.
 */
export function raised(g: CanvasRenderingContext2D, shape: Path2D, depth: number, top: [string, string], side: string, y0: number, y1: number, shadow = 'rgba(45, 30, 95, 0.35)'): void {
  g.save();
  g.shadowColor = shadow;
  g.shadowBlur = depth * 2.2;
  g.shadowOffsetY = depth * 1.1;
  g.translate(0, depth);
  g.fillStyle = side;
  g.fill(shape);
  g.restore();
  for (let t = depth * 0.75; t > 0; t -= Math.max(1, depth / 5)) {
    g.save(); g.translate(0, t); g.fillStyle = side; g.fill(shape); g.restore();
  }
  const grad = g.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, top[0]);
  grad.addColorStop(1, top[1]);
  g.fillStyle = grad;
  g.fill(shape);
}

/**
 * Shade the inside edges of `shape` as if its rim stood above it (a sunken
 * floor): the outside is drawn black on a scratch canvas, clipped away, and
 * only its blurred shadow falls inside. `g` must be scaled by `dpr`.
 */
export function insetShadow(g: CanvasRenderingContext2D, shape: Path2D, dpr: number, blur: number, offY: number, color: string): void {
  const cw = g.canvas.width, ch = g.canvas.height;
  const o = document.createElement('canvas');
  o.width = cw;
  o.height = ch;
  const og = o.getContext('2d')!;
  og.fillStyle = '#000';
  og.fillRect(0, 0, cw, ch);
  og.scale(dpr, dpr);
  og.globalCompositeOperation = 'destination-out';
  og.fill(shape);
  g.save();
  g.clip(shape);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.shadowColor = color;
  g.shadowBlur = blur * dpr;
  g.shadowOffsetY = offY * dpr;
  g.drawImage(o, 0, 0);
  g.restore();
}

// ---------------------------------------------------------------- lock & key

/** A glossy gold padlock centred at (x, y), `s` across the body: shackle, body, keyhole. */
export function drawPadlock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const line = '#3a2600';
  // shackle
  ctx.lineCap = 'round';
  ctx.strokeStyle = line;
  ctx.lineWidth = s * 0.26;
  ctx.beginPath(); ctx.arc(x, y - s * 0.22, s * 0.28, Math.PI, 0); ctx.lineTo(x + s * 0.28, y); ctx.moveTo(x - s * 0.28, y - s * 0.22); ctx.lineTo(x - s * 0.28, y); ctx.stroke();
  ctx.strokeStyle = '#f2c230';
  ctx.lineWidth = s * 0.14;
  ctx.beginPath(); ctx.arc(x, y - s * 0.22, s * 0.28, Math.PI, 0); ctx.lineTo(x + s * 0.28, y); ctx.moveTo(x - s * 0.28, y - s * 0.22); ctx.lineTo(x - s * 0.28, y); ctx.stroke();
  // body
  ctx.fillStyle = line;
  roundRect(ctx, x - s * 0.52, y - s * 0.12, s * 1.04, s * 0.86, s * 0.22); ctx.fill();
  const g = ctx.createLinearGradient(x - s * 0.5, y - s * 0.1, x + s * 0.5, y + s * 0.7);
  g.addColorStop(0, '#fff2a0');
  g.addColorStop(0.45, '#ffcc2a');
  g.addColorStop(1, '#d68a00');
  ctx.fillStyle = g;
  roundRect(ctx, x - s * 0.45, y - s * 0.06, s * 0.9, s * 0.74, s * 0.18); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.22, y + s * 0.06, s * 0.14, s * 0.06, -0.4, 0, Math.PI * 2); ctx.fill();
  // keyhole
  ctx.fillStyle = '#2a1800';
  ctx.beginPath(); ctx.arc(x, y + s * 0.26, s * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - s * 0.05, y + s * 0.3); ctx.lineTo(x + s * 0.05, y + s * 0.3); ctx.lineTo(x + s * 0.08, y + s * 0.5); ctx.lineTo(x - s * 0.08, y + s * 0.5); ctx.closePath(); ctx.fill();
}

/** A glossy gold key centred at (x, y), `s` long, turned by `rot` (radians). */
export function drawKey(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot = -0.6): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const line = '#3a2600';
  for (const [col, grow] of [[line, s * 0.07], ['#ffcc2a', 0]] as const) {
    ctx.fillStyle = col;
    // bow (ring)
    ctx.beginPath(); ctx.arc(-s * 0.3, 0, s * 0.2 + grow, 0, Math.PI * 2); ctx.fill();
    // shaft and teeth
    roundRect(ctx, -s * 0.14 - grow, -s * 0.06 - grow, s * 0.62 + grow * 2, s * 0.12 + grow * 2, s * 0.05); ctx.fill();
    ctx.fillRect(s * 0.3 - grow, s * 0.02, s * 0.08 + grow * 2, s * 0.16 + grow);
    ctx.fillRect(s * 0.14 - grow, s * 0.02, s * 0.07 + grow * 2, s * 0.11 + grow);
  }
  ctx.fillStyle = '#7a4a00';
  ctx.beginPath(); ctx.arc(-s * 0.3, 0, s * 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath(); ctx.ellipse(-s * 0.36, -s * 0.09, s * 0.07, s * 0.035, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** A round desert cactus with two arms and a pink flower (the sand theme's roadside). */
export function cactus(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(120, 70, 10, 0.2)';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.3, s * 0.36, s * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  const body = (bx: number, by: number, w: number, h: number): void => {
    ctx.fillStyle = '#2f7d3a';
    roundRect(ctx, bx - w / 2 - s * 0.025, by - s * 0.025, w + s * 0.05, h + s * 0.05, w / 2); ctx.fill();
    const g = ctx.createLinearGradient(bx - w / 2, 0, bx + w / 2, 0);
    g.addColorStop(0, '#7fd35a');
    g.addColorStop(1, '#3f9a3f');
    ctx.fillStyle = g;
    roundRect(ctx, bx - w / 2, by, w, h, w / 2); ctx.fill();
  };
  body(x - s * 0.24, y - s * 0.32, s * 0.14, s * 0.32);
  body(x + s * 0.24, y - s * 0.42, s * 0.14, s * 0.34);
  ctx.fillStyle = '#4ea84a';
  ctx.fillRect(x - s * 0.24, y - s * 0.06, s * 0.24, s * 0.1);
  ctx.fillRect(x, y - s * 0.16, s * 0.24, s * 0.1);
  body(x, y - s * 0.6, s * 0.22, s * 0.9);
  ctx.fillStyle = '#ff8fb8';
  ctx.beginPath(); ctx.arc(x, y - s * 0.62, s * 0.07, 0, Math.PI * 2); ctx.fill();
}

/** A round tree with snow on its crown (the snow theme's roadside). */
export function snowTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  tree(ctx, x, y, s);
  ctx.fillStyle = '#ffffff';
  for (const [dx, dy, r] of [[-0.18, -0.6, 0.2], [0.12, -0.66, 0.17], [-0.03, -0.75, 0.14]] as const) {
    ctx.beginPath(); ctx.ellipse(x + dx * s, y + dy * s, r * s, r * s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  }
}

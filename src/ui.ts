// In-game UI drawn on the canvas, in the reference's look: cream cards with a
// blue title banner and chequered flags, a red round close button, fat green
// pill buttons, yellow booster tiles with a count badge. Drawing only.

import { FONT, INK, outlinedText, roundRect, shade } from './art';

export type BoosterKey = 'broom' | 'shuffle' | 'magnet' | 'slot';

export interface Rect { x: number; y: number; w: number; h: number }
export const inside = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// ---------------------------------------------------------------- icons

export function boosterIcon(ctx: CanvasRenderingContext2D, key: BoosterKey, x: number, y: number, r: number): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (key === 'slot') {
    // blue parking tile with a P and a green +1
    ctx.fillStyle = '#1b2150';
    roundRect(ctx, x - r * 0.55, y - r * 0.55, r * 1.1, r * 1.1, r * 0.25); ctx.fill();
    const g = ctx.createLinearGradient(0, y - r * 0.5, 0, y + r * 0.5);
    g.addColorStop(0, '#5aa2ff');
    g.addColorStop(1, '#2459d6');
    ctx.fillStyle = g;
    roundRect(ctx, x - r * 0.48, y - r * 0.48, r * 0.96, r * 0.96, r * 0.2); ctx.fill();
    outlinedText(ctx, 'P', x - r * 0.05, y, r * 0.8, '#ffffff', '#1b2150');
    ctx.fillStyle = '#0a4115';
    roundRect(ctx, x + r * 0.12, y + r * 0.12, r * 0.56, r * 0.48, r * 0.12); ctx.fill();
    ctx.fillStyle = '#4fd23a';
    roundRect(ctx, x + r * 0.15, y + r * 0.15, r * 0.5, r * 0.42, r * 0.1); ctx.fill();
    outlinedText(ctx, '+1', x + r * 0.4, y + r * 0.36, r * 0.32, '#ffffff', '#0a4115');
  } else if (key === 'broom') {
    // a yellow broom with a blue band, tilted
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.5);
    ctx.fillStyle = '#1b2150';
    roundRect(ctx, -r * 0.1, -r * 0.8, r * 0.2, r * 0.75, r * 0.1); ctx.fill();
    ctx.fillStyle = '#f2a33a';
    roundRect(ctx, -r * 0.06, -r * 0.76, r * 0.12, r * 0.7, r * 0.06); ctx.fill();
    ctx.fillStyle = '#1b2150';
    ctx.beginPath();
    ctx.moveTo(-r * 0.32, -r * 0.12); ctx.lineTo(r * 0.32, -r * 0.12); ctx.lineTo(r * 0.5, r * 0.72); ctx.lineTo(-r * 0.5, r * 0.72); ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(0, -r * 0.1, 0, r * 0.7);
    g.addColorStop(0, '#ffe066');
    g.addColorStop(1, '#f5b81f');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-r * 0.27, -r * 0.08); ctx.lineTo(r * 0.27, -r * 0.08); ctx.lineTo(r * 0.44, r * 0.66); ctx.lineTo(-r * 0.44, r * 0.66); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#c98a10';
    ctx.lineWidth = r * 0.05;
    for (const k of [-0.2, 0, 0.2]) { ctx.beginPath(); ctx.moveTo(k * r, r * 0.25); ctx.lineTo(k * 1.4 * r, r * 0.6); ctx.stroke(); }
    ctx.fillStyle = '#2f7fe8';
    roundRect(ctx, -r * 0.33, -r * 0.14, r * 0.66, r * 0.2, r * 0.06); ctx.fill();
    ctx.restore();
  } else if (key === 'shuffle') {
    // two crossing arrows, green and yellow
    for (const [col, dir] of [['#3fc42a', 1], ['#ffc93a', -1]] as const) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, dir);
      ctx.strokeStyle = '#1b2150';
      ctx.lineWidth = r * 0.34;
      ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.38); ctx.bezierCurveTo(-r * 0.1, r * 0.38, r * 0.0, -r * 0.38, r * 0.4, -r * 0.38); ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = r * 0.2;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.strokeStyle = '#1b2150';
      ctx.lineWidth = r * 0.07;
      ctx.beginPath(); ctx.moveTo(r * 0.72, -r * 0.38); ctx.lineTo(r * 0.36, -r * 0.66); ctx.lineTo(r * 0.36, -r * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  } else if (key === 'magnet') {
    // a red-and-blue horseshoe magnet with silver tips
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.6);
    for (const [col, lw] of [['#1b2150', 0.5], ['#ff3d55', 0.34]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = r * lw;
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.moveTo(-r * 0.34, -r * 0.5); ctx.lineTo(-r * 0.34, r * 0.05);
      ctx.arc(0, r * 0.05, r * 0.34, Math.PI, 0, true);
      ctx.lineTo(r * 0.34, -r * 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = '#2f6bff';
    ctx.lineWidth = r * 0.34;
    ctx.beginPath(); ctx.arc(0, r * 0.05, r * 0.34, Math.PI * 0.25, Math.PI * 0.75); ctx.stroke();
    ctx.fillStyle = '#e8ecff';
    ctx.strokeStyle = '#1b2150';
    ctx.lineWidth = r * 0.06;
    for (const sx of [-1, 1]) { ctx.fillRect(sx * r * 0.34 - r * 0.17, -r * 0.72, r * 0.34, r * 0.22); ctx.strokeRect(sx * r * 0.34 - r * 0.17, -r * 0.72, r * 0.34, r * 0.22); }
    ctx.restore();
  }
}

/**
 * A chunky 3D puck under a round button: a soft shadow on the ground, then the
 * button's darker side showing below its face (`depth` × r), as a toy button.
 */
function puck(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, depth: number, side: string): void {
  ctx.fillStyle = 'rgba(20, 25, 80, 0.32)';
  ctx.beginPath(); ctx.ellipse(x, y + r * (depth + 0.14), r * 1.02, r * 0.98, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = side;
  ctx.beginPath(); ctx.arc(x, y + r * depth, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - r, y, r * 2, r * depth);
}

/** A recessed glossy face: darker along its upper inner edge, a light bounce along the bottom, a highlight band. */
function recess(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(10, 30, 90, 0.22)';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath(); ctx.arc(x, y, r * 0.95, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = r * 0.07;
  ctx.beginPath(); ctx.arc(x, y, r * 0.93, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.12, y - r * 0.55, r * 0.55, r * 0.2, -0.12, 0, Math.PI * 2); ctx.fill();
}

/** A round booster button: a chunky 3D puck, blue rim, thick white border, recessed light-blue glossy face, red badge. */
export function roundBooster(ctx: CanvasRenderingContext2D, key: BoosterKey, label: string, x: number, y: number, r: number, count: number, enabled: boolean, press: number, armed: boolean, locked: number, ad = false): void {
  const k = 1 - 0.12 * Math.max(0, press);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (armed) {
    const t = performance.now() / 1000;
    ctx.fillStyle = `rgba(255, 243, 107, ${0.5 + 0.25 * Math.sin(t * 8)})`;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.32, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = enabled ? 1 : 0.75;
  // pressed: the face sinks onto its side
  const depth = 0.2 * (1 - Math.max(0, press) * 0.7);
  puck(ctx, 0, 0, r * 1.06, depth, '#0d3b8f');
  const rim = ctx.createLinearGradient(0, -r * 1.06, 0, r * 1.06);
  rim.addColorStop(0, '#4c9cff');
  rim.addColorStop(1, '#1650b4');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.06, 0, Math.PI * 2); ctx.fill();
  const ring = ctx.createLinearGradient(0, -r, 0, r);
  ring.addColorStop(0, '#ffffff');
  ring.addColorStop(1, '#cfdcf0');
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(0, -r * 0.02, r * 0.98, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.25, -r * 0.35, r * 0.1, 0, 0, r * 0.86);
  g.addColorStop(0, locked ? '#eef0f6' : '#f2fbff');
  g.addColorStop(0.6, locked ? '#c9cddc' : '#b8e2ff');
  g.addColorStop(1, locked ? '#9ea4bc' : '#78bdf2');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, -r * 0.02, r * 0.84, 0, Math.PI * 2); ctx.fill();
  recess(ctx, 0, -r * 0.02, r * 0.84);
  if (locked) {
    ctx.fillStyle = '#6a7090';
    roundRect(ctx, -r * 0.3, -r * 0.16, r * 0.6, r * 0.46, r * 0.1); ctx.fill();
    ctx.strokeStyle = '#6a7090';
    ctx.lineWidth = r * 0.11;
    ctx.beginPath(); ctx.arc(0, -r * 0.18, r * 0.19, Math.PI, 0); ctx.stroke();
  } else {
    boosterIcon(ctx, key, 0, -r * 0.02, r * 0.66);
    const bx = r * 0.72, by = r * 0.64, br = r * 0.3;
    puck(ctx, bx, by, br + r * 0.06, 0.22, count > 0 ? '#8c0f1c' : '#0f6b2c');
    ctx.fillStyle = '#ffe2e4';
    ctx.beginPath(); ctx.arc(bx, by, br + r * 0.06, 0, Math.PI * 2); ctx.fill();
    const bgr = ctx.createLinearGradient(0, by - br, 0, by + br);
    bgr.addColorStop(0, count > 0 ? '#ff6b73' : '#5be37a');
    bgr.addColorStop(1, count > 0 ? '#d81e2c' : '#20a84a');
    ctx.fillStyle = bgr;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    if (count <= 0 && ad) {
      // empty: a little video camera — one more for a rewarded ad
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, bx - br * 0.5, by - br * 0.32, br * 0.68, br * 0.64, br * 0.14); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx + br * 0.2, by); ctx.lineTo(bx + br * 0.55, by - br * 0.28); ctx.lineTo(bx + br * 0.55, by + br * 0.28); ctx.closePath(); ctx.fill();
    } else outlinedText(ctx, count > 0 ? String(count) : '+', bx, by, br * 1.3, '#ffffff', count > 0 ? '#7a0a18' : '#0a4115');
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  outlinedText(ctx, locked ? `Lv ${locked}` : label, x, y + r * 1.2, r * 0.36, '#ffffff', '#15161f');
}

/**
 * The round speed button of the reference: off — an orange face with a blue
 * fast-forward, "Speed"; on — a red face with white pause bars, "Speeding".
 */
export function speedButton(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, on: boolean, t: number): void {
  puck(ctx, x, y, r * 1.08, 0.2, on ? '#6e0a14' : '#9a5200');
  const ring = ctx.createLinearGradient(0, y - r, 0, y + r);
  ring.addColorStop(0, '#ffffff');
  ring.addColorStop(1, '#e6dccd');
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = on ? '#9a1020' : '#c26a00';
  ctx.beginPath(); ctx.arc(x, y, r * 0.96, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r * 0.88);
  g.addColorStop(0, on ? '#ff8a8a' : '#fff1a0');
  g.addColorStop(1, on ? '#e3202e' : '#ffb21a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, Math.PI * 2); ctx.fill();
  recess(ctx, x, y, r * 0.86);
  if (on) {
    for (const dx of [-0.2, 0.2]) {
      ctx.fillStyle = '#7a0a14';
      roundRect(ctx, x + dx * r - r * 0.11, y - r * 0.33, r * 0.22, r * 0.7, r * 0.08); ctx.fill();
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x + dx * r - r * 0.08, y - r * 0.36, r * 0.16, r * 0.66, r * 0.07); ctx.fill();
    }
  } else {
    ctx.lineJoin = 'round';
    for (const dx of [-0.24, 0.12]) {
      ctx.beginPath();
      ctx.moveTo(x + (dx - 0.12) * r, y - r * 0.32);
      ctx.lineTo(x + (dx + 0.24) * r, y);
      ctx.lineTo(x + (dx - 0.12) * r, y + r * 0.32);
      ctx.closePath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.14;
      ctx.stroke();
      ctx.fillStyle = '#1f5fe0';
      ctx.fill();
    }
  }
  void t;
  outlinedText(ctx, on ? 'Speeding' : 'Speed', x, y + r * 1.42, r * 0.4, '#ffffff', '#15161f');
}

/** Round white button with a blue rim (home, close of album). */
export function roundButton(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, glyph: 'home' | 'gear' | 'replay'): void {
  puck(ctx, x, y, r, 0.16, '#8fb2db');
  const ring = ctx.createLinearGradient(0, y - r, 0, y + r);
  ring.addColorStop(0, '#ffffff');
  ring.addColorStop(1, '#d6e4f4');
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#bfe3ff';
  ctx.beginPath(); ctx.arc(x, y, r * 0.88, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, '#5fb0ff');
  g.addColorStop(1, '#185ec7');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, Math.PI * 2); ctx.fill();
  recess(ctx, x, y, r * 0.78);
  ctx.fillStyle = '#ffffff';
  if (glyph === 'home') {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.48); ctx.lineTo(x + r * 0.48, y - r * 0.04); ctx.lineTo(x + r * 0.34, y - r * 0.04);
    ctx.lineTo(x + r * 0.34, y + r * 0.42); ctx.lineTo(x + r * 0.1, y + r * 0.42); ctx.lineTo(x + r * 0.1, y + r * 0.14);
    ctx.lineTo(x - r * 0.1, y + r * 0.14); ctx.lineTo(x - r * 0.1, y + r * 0.42); ctx.lineTo(x - r * 0.34, y + r * 0.42);
    ctx.lineTo(x - r * 0.34, y - r * 0.04); ctx.lineTo(x - r * 0.48, y - r * 0.04); ctx.closePath();
    ctx.fill();
  } else if (glyph === 'replay') {
    // a circular arrow, open at the top, its head running clockwise into the gap
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = r * 0.15;
    ctx.lineCap = 'round';
    const a0 = -Math.PI * 0.42, a1 = a0 + Math.PI * 1.62, rr = r * 0.34;
    ctx.beginPath(); ctx.arc(x, y, rr, a0, a1); ctx.stroke();
    const px = x + Math.cos(a1) * rr, py = y + Math.sin(a1) * rr;
    const tx = -Math.sin(a1), ty = Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1);
    ctx.beginPath();
    ctx.moveTo(px + tx * r * 0.26, py + ty * r * 0.26);
    ctx.lineTo(px + nx * r * 0.2 - tx * r * 0.04, py + ny * r * 0.2 - ty * r * 0.04);
    ctx.lineTo(px - nx * r * 0.2 - tx * r * 0.04, py - ny * r * 0.2 - ty * r * 0.04);
    ctx.closePath(); ctx.fill();
  } else {
    for (let k = 0; k < 8; k++) {
      ctx.save(); ctx.translate(x, y); ctx.rotate((k * Math.PI) / 4);
      ctx.fillRect(-r * 0.09, -r * 0.5, r * 0.18, r * 0.2);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(x, y, r * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1e64e0';
    ctx.beginPath(); ctx.arc(x, y, r * 0.15, 0, Math.PI * 2); ctx.fill();
  }
}

/** The level bar: a deep-blue capsule with a cyan rim inside a thin white one, a thin progress fill. */
export function levelPill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, prog: number): void {
  ctx.fillStyle = 'rgba(20, 30, 90, 0.32)';
  roundRect(ctx, x - 3, y + h * 0.3, w + 6, h + 6, (h + 6) / 2); ctx.fill();
  ctx.fillStyle = '#0b2f7a';
  roundRect(ctx, x - 3, y + h * 0.16 - 3, w + 6, h + 6, (h + 6) / 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x - 3, y - 3, w + 6, h + 6, (h + 6) / 2); ctx.fill();
  ctx.fillStyle = '#4fd6ff';
  roundRect(ctx, x - 1, y - 1, w + 2, h + 2, (h + 2) / 2); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#2f7be6');
  g.addColorStop(1, '#1446a8');
  ctx.fillStyle = g;
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, (h - 3) / 2); ctx.fill();
  if (prog > 0) {
    ctx.save();
    roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, (h - 3) / 2); ctx.clip();
    const pg = ctx.createLinearGradient(0, y, 0, y + h);
    pg.addColorStop(0, '#ffe766');
    pg.addColorStop(1, '#ffae17');
    ctx.fillStyle = pg;
    ctx.fillRect(x, y, Math.max(h * 0.6, w * prog), h);
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, x + h * 0.35, y + h * 0.12, w - h * 0.7, h * 0.28, h * 0.14); ctx.fill();
  outlinedText(ctx, text, x + w / 2, y + h / 2 + 1, h * 0.56, '#ffffff', '#0d2a6e');
}

/** The "🚌 n/6 [+]" counter on the road. */
export function slotPill(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, used: number, slots: number, full: boolean): Rect {
  const text = `${used}/${slots}`;
  ctx.font = `900 ${h * 0.6}px ${FONT}`;
  const tw = ctx.measureText(text).width;
  const w = h * 1.1 + tw + h * 1.35;
  const x0 = x - w / 2;
  ctx.fillStyle = 'rgba(20, 30, 90, 0.35)';
  roundRect(ctx, x0 - 3, y - h / 2 + h * 0.3, w + 6, h + 6, h * 0.32); ctx.fill();
  ctx.fillStyle = full ? '#7a0a14' : '#0b3b8f';
  roundRect(ctx, x0 - 3, y - h / 2 + h * 0.15 - 3, w + 6, h + 6, h * 0.32); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x0 - 3, y - h / 2 - 3, w + 6, h + 6, h * 0.32); ctx.fill();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, full ? '#ff6b73' : '#3d8af0');
  g.addColorStop(1, full ? '#c8202e' : '#185ec7');
  ctx.fillStyle = g;
  roundRect(ctx, x0, y - h / 2, w, h, h * 0.26); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, x0 + h * 0.2, y - h * 0.42, w - h * 0.4, h * 0.26, h * 0.12); ctx.fill();
  // little bus icon
  const bx = x0 + h * 0.58;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, bx - h * 0.34, y - h * 0.28, h * 0.68, h * 0.5, h * 0.12); ctx.fill();
  ctx.fillStyle = '#ff4a52';
  roundRect(ctx, bx - h * 0.29, y - h * 0.23, h * 0.58, h * 0.4, h * 0.09); ctx.fill();
  ctx.fillStyle = '#bfe6ff';
  ctx.fillRect(bx - h * 0.22, y - h * 0.16, h * 0.44, h * 0.14);
  ctx.fillStyle = '#15161f';
  ctx.beginPath(); ctx.arc(bx - h * 0.16, y + h * 0.2, h * 0.07, 0, Math.PI * 2); ctx.arc(bx + h * 0.16, y + h * 0.2, h * 0.07, 0, Math.PI * 2); ctx.fill();
  outlinedText(ctx, text, x0 + h * 1.1 + tw / 2, y + 1, h * 0.6, '#ffffff', '#0d2a6e');
  // green +
  const px = x0 + w - h * 0.6;
  const plus: Rect = { x: px - h * 0.42, y: y - h * 0.42, w: h * 0.84, h: h * 0.84 };
  ctx.fillStyle = '#0d6b2a';
  roundRect(ctx, plus.x - 2, plus.y + h * 0.1 - 2, plus.w + 4, plus.h + 4, h * 0.22); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, plus.x - 2, plus.y - 2, plus.w + 4, plus.h + 4, h * 0.22); ctx.fill();
  const pg = ctx.createLinearGradient(0, plus.y, 0, plus.y + plus.h);
  pg.addColorStop(0, '#6fe36a');
  pg.addColorStop(1, '#20a83f');
  ctx.fillStyle = pg;
  roundRect(ctx, plus.x, plus.y, plus.w, plus.h, h * 0.2); ctx.fill();
  outlinedText(ctx, '+', px, y, h * 0.72, '#ffffff', '#0a4115');
  return { x: plus.x - 6, y: plus.y - 6, w: plus.w + 12, h: plus.h + 12 };
}

// ---------------------------------------------------------------- popups

/** Fat green (or orange / grey) pill button. */
export function pillButton(ctx: CanvasRenderingContext2D, r: Rect, label: string, tone: 'green' | 'orange' | 'blue' = 'green', ad = false): void {
  const [top, bot, line] = tone === 'green' ? ['#a6f06a', '#3fb81f', '#1d6a0c'] : tone === 'orange' ? ['#ffc46b', '#f07a12', '#6b2a00'] : ['#7cc0ff', '#2f7fe8', '#14408f'];
  const rad = r.h / 2;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, r.x - r.h * 0.07, r.y - r.h * 0.07, r.w + r.h * 0.14, r.h * 1.2, rad * 1.07); ctx.fill();
  ctx.fillStyle = line;
  roundRect(ctx, r.x, r.y + r.h * 0.06, r.w, r.h, rad); ctx.fill();
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  roundRect(ctx, r.x, r.y, r.w, r.h - r.h * 0.04, rad); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  roundRect(ctx, r.x + r.h * 0.35, r.y + r.h * 0.1, r.w - r.h * 0.7, r.h * 0.24, r.h * 0.12); ctx.fill();
  let tx = r.x + r.w / 2;
  if (ad) {
    // clapperboard: "watch a video"
    const s = r.h * 0.5, ix = r.x + r.w / 2 - r.w * 0.26, iy = r.y + r.h * 0.5;
    ctx.fillStyle = '#1b2150';
    roundRect(ctx, ix - s * 0.55, iy - s * 0.3, s * 1.1, s * 0.75, s * 0.12); ctx.fill();
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, ix - s * 0.45, iy - s * 0.2, s * 0.9, s * 0.55, s * 0.08); ctx.fill();
    ctx.fillStyle = '#2f7fe8';
    ctx.beginPath(); ctx.moveTo(ix - s * 0.12, iy - s * 0.08); ctx.lineTo(ix + s * 0.22, iy + s * 0.08); ctx.lineTo(ix - s * 0.12, iy + s * 0.24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b2150';
    ctx.save(); ctx.translate(ix - s * 0.55, iy - s * 0.32); ctx.rotate(-0.25);
    roundRect(ctx, 0, -s * 0.2, s * 1.1, s * 0.2, s * 0.05); ctx.fill();
    ctx.restore();
    tx += r.w * 0.08;
  }
  outlinedText(ctx, label, tx, r.y + r.h * 0.47, r.h * 0.42, '#ffffff', line);
}

function flag(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number): void {
  ctx.strokeStyle = '#c99a2b';
  ctx.lineWidth = s * 0.1;
  ctx.beginPath(); ctx.moveTo(x, y + s * 0.6); ctx.lineTo(x, y - s * 0.8); ctx.stroke();
  ctx.fillStyle = '#ffd21f';
  ctx.beginPath(); ctx.arc(x, y - s * 0.85, s * 0.1, 0, Math.PI * 2); ctx.fill();
  const fw = s * 0.9 * dir, fh = s * 0.62, n = 4;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#2b2d3c';
      const wave = Math.sin(i * 0.9) * s * 0.05;
      ctx.fillRect(x + (fw / n) * i, y - s * 0.75 + (fh / 3) * j + wave, fw / n + dir * 0.5, fh / 3 + 0.5);
    }
  }
}

/** The popup card: cream frame, light-blue body, blue title banner with flags. Returns the close-button rect. */
export function popupCard(ctx: CanvasRenderingContext2D, r: Rect, title: string, u: number, close = true, bannerOnly = false): Rect | null {
  const { x, y, w, h } = r;
  if (!bannerOnly) {
  ctx.fillStyle = 'rgba(30, 20, 70, 0.3)';
  roundRect(ctx, x, y + u * 0.02, w, h, u * 0.05); ctx.fill();
  ctx.fillStyle = '#b8834a';
  roundRect(ctx, x - 3, y - 3 + u * 0.028, w + 6, h + 6, u * 0.055); ctx.fill();
  ctx.fillStyle = '#e8b97a';
  roundRect(ctx, x - 3, y - 3, w + 6, h + 6, u * 0.055); ctx.fill();
  ctx.fillStyle = '#fff4dc';
  roundRect(ctx, x, y, w, h, u * 0.05); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#f2f8ff');
  g.addColorStop(1, '#d6e9ff');
  ctx.fillStyle = g;
  roundRect(ctx, x + u * 0.025, y + u * 0.08, w - u * 0.05, h - u * 0.105, u * 0.035); ctx.fill();
  // bushes along the top edge
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k % 2 ? '#6cc94a' : '#4fb33a';
      ctx.beginPath(); ctx.arc(x + w / 2 + s * (w * 0.42 - k * u * 0.035), y + u * 0.01, u * 0.03, Math.PI, 0); ctx.fill();
    }
  }
  }
  // banner
  const bw = w * 0.74, bh = u * 0.12, bx = x + (w - bw) / 2, by = y - bh * 0.55;
  flag(ctx, bx + bh * 0.1, by + bh * 0.25, bh * 0.75, -1);
  flag(ctx, bx + bw - bh * 0.1, by + bh * 0.25, bh * 0.75, 1);
  ctx.fillStyle = '#e8b97a';
  roundRect(ctx, bx - 4, by - 4, bw + 8, bh + 8, bh * 0.3); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, bx - 1.5, by - 1.5, bw + 3, bh + 3, bh * 0.28); ctx.fill();
  const bg = ctx.createLinearGradient(0, by, 0, by + bh);
  bg.addColorStop(0, '#7cc4ff');
  bg.addColorStop(1, '#2f86ec');
  ctx.fillStyle = bg;
  roundRect(ctx, bx, by, bw, bh, bh * 0.26); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, bx + bh * 0.2, by + bh * 0.08, bw - bh * 0.4, bh * 0.3, bh * 0.15); ctx.fill();
  outlinedText(ctx, title, x + w / 2, by + bh / 2 + 1, bh * 0.52, '#ffffff', '#14408f');
  if (!close) return null;
  const cr = u * 0.045, cx = x + w - cr * 0.4, cy = y + cr * 0.2;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, cr * 1.15, 0, Math.PI * 2); ctx.fill();
  const rg = ctx.createLinearGradient(0, cy - cr, 0, cy + cr);
  rg.addColorStop(0, '#ff7a7a');
  rg.addColorStop(1, '#d81e2c');
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = cr * 0.28;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - cr * 0.38, cy - cr * 0.38); ctx.lineTo(cx + cr * 0.38, cy + cr * 0.38);
  ctx.moveTo(cx + cr * 0.38, cy - cr * 0.38); ctx.lineTo(cx - cr * 0.38, cy + cr * 0.38);
  ctx.stroke();
  return { x: cx - cr * 1.4, y: cy - cr * 1.4, w: cr * 2.8, h: cr * 2.8 };
}

/** Blue text box with a dashed inner border (the explanation on cards). */
export function infoBox(ctx: CanvasRenderingContext2D, r: Rect, lines: string[], size: number): void {
  ctx.fillStyle = '#5aa8ff';
  roundRect(ctx, r.x, r.y, r.w, r.h, size * 0.6); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.setLineDash([size * 0.3, size * 0.25]);
  ctx.lineWidth = 1.5;
  roundRect(ctx, r.x + size * 0.25, r.y + size * 0.25, r.w - size * 0.5, r.h - size * 0.5, size * 0.45); ctx.stroke();
  ctx.setLineDash([]);
  const lh = size * 1.3, y0 = r.y + r.h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => outlinedText(ctx, l, r.x + r.w / 2, y0 + i * lh, size, '#ffffff', '#1d4fa8'));
}

/** Yellow tile (the big icon on a card). */
export function iconTile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(200,130,20,0.35)';
  roundRect(ctx, x - s / 2, y - s / 2 + s * 0.04, s, s, s * 0.22); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x - s / 2, y - s / 2, s, s, s * 0.22); ctx.fill();
  const g = ctx.createLinearGradient(0, y - s / 2, 0, y + s / 2);
  g.addColorStop(0, '#fff3c0');
  g.addColorStop(1, '#ffc548');
  ctx.fillStyle = g;
  roundRect(ctx, x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9, s * 0.18); ctx.fill();
}

/** A purple ribbon banner (Level Failed). */
export function ribbon(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string, hue: 'purple' | 'gold'): void {
  const [a, b, d] = hue === 'purple' ? ['#c8b6ff', '#8a6cf0', '#4a2fa8'] : ['#fff08a', '#ffb81f', '#9a5a00'];
  ctx.fillStyle = shade(b, -0.3);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * w * 0.4, y - h * 0.1);
    ctx.lineTo(x + s * w * 0.62, y + h * 0.05);
    ctx.lineTo(x + s * w * 0.55, y + h * 0.35);
    ctx.lineTo(x + s * w * 0.64, y + h * 0.65);
    ctx.lineTo(x + s * w * 0.4, y + h * 0.55);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = d;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 3, y - h / 2 + h * 0.12);
  ctx.quadraticCurveTo(x, y - h / 2 - h * 0.25, x + w / 2 + 3, y - h / 2 + h * 0.12);
  ctx.lineTo(x + w / 2 + 3, y + h / 2 + 3);
  ctx.quadraticCurveTo(x, y + h / 2 - h * 0.35, x - w / 2 - 3, y + h / 2 + 3);
  ctx.closePath();
  ctx.fill();
  const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h / 2 + h * 0.14);
  ctx.quadraticCurveTo(x, y - h / 2 - h * 0.2, x + w / 2, y - h / 2 + h * 0.14);
  ctx.lineTo(x + w / 2, y + h / 2);
  ctx.quadraticCurveTo(x, y + h / 2 - h * 0.35, x - w / 2, y + h / 2);
  ctx.closePath();
  ctx.fill();
  outlinedText(ctx, title, x, y - h * 0.02, h * 0.5, '#ffffff', d);
}

/** Speech panel at the bottom with the mascot's name tab. */
export function dialog(ctx: CanvasRenderingContext2D, r: Rect, name: string, text: string, size: number): void {
  ctx.fillStyle = 'rgba(30, 30, 80, 0.25)';
  roundRect(ctx, r.x, r.y + 4, r.w, r.h, size); ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, r.x, r.y, r.w, r.h, size); ctx.fill();
  const tw = size * 4.6;
  ctx.fillStyle = '#2f86ec';
  roundRect(ctx, r.x, r.y, tw, size * 1.8, size * 0.8); ctx.fill();
  ctx.fillRect(r.x, r.y + size, size, size * 0.8);
  outlinedText(ctx, name, r.x + tw / 2, r.y + size * 0.9, size * 0.95, '#ffffff', '#14408f');
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = '#26305f';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  // wrap
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const wd of words) {
    const t = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(t).width > r.w - size * 2) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  lines.forEach((l, i) => ctx.fillText(l, r.x + size, r.y + size * 2.6 + i * size * 1.3));
}

export function toast(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, alpha: number): void {
  ctx.font = `900 ${size}px ${FONT}`;
  const w = Math.max(size * 6, ctx.measureText(text).width + size * 1.6);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(25, 25, 70, 0.82)';
  roundRect(ctx, x - w / 2, y - size, w, size * 2, size); ctx.fill();
  outlinedText(ctx, text, x, y, size, '#ffffff', '#1b2150');
  ctx.globalAlpha = 1;
}

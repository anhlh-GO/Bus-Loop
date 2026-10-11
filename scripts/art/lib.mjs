// A 40 × 40 picture: a patterned backdrop in a frame, a big outlined subject on top.
export const N = 40;
export function layer(fill = '.', T = { k: 1, ox: 0, oy: 0 }) {
  const g = Array.from({ length: N }, () => Array(N).fill(fill));
  const at = (x, y) => (x >= 0 && x < N && y >= 0 && y < N ? g[y][x] : undefined);
  // tests see design coordinates: a cell centre mapped back through the transform
  const each = (test, c) => { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = (x + 0.5 - T.ox) / T.k, v = (y + 0.5 - T.oy) / T.k; if (test(u, v, g[y][x])) g[y][x] = typeof c === 'function' ? c(u, v, g[y][x]) : c; } };
  const inPoly = (pts, x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
  const segD = (x, y, x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)); return Math.hypot(x - x0 - dx * t, y - y0 - dy * t); };
  return {
    g, at, each,
    rect: (x0, y0, x1, y1, c) => each((x, y) => x >= x0 && x < x1 && y >= y0 && y < y1, c),
    ell: (cx, cy, rx, ry, c) => each((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c),
    ring: (cx, cy, r0, r1, c, a0 = -9, a1 = 9) => each((x, y) => { const d = Math.hypot(x - cx, y - cy), a = Math.atan2(y - cy, x - cx); return d >= r0 && d <= r1 && a >= a0 && a <= a1; }, c),
    poly: (pts, c) => each((x, y) => inPoly(pts, x, y), c),
    line: (x0, y0, x1, y1, w, c) => each((x, y) => segD(x, y, x0, y0, x1, y1) <= w / 2, c),
    path: (pts, w, c) => each((x, y) => pts.some((p, i) => i > 0 && segD(x, y, pts[i - 1][0], pts[i - 1][1], p[0], p[1]) <= w / 2), c),
    dot: (x, y, c) => { const tx = Math.floor(T.ox + (x + 0.5) * T.k), ty = Math.floor(T.oy + (y + 0.5) * T.k); if (tx >= 0 && tx < N && ty >= 0 && ty < N) g[ty][tx] = c; },
    // recolour cells of colour `from` that pass a test
    tint: (from, test, c) => each((x, y, v) => v === from && test(x, y), c),
  };
}

/** Backdrop patterns, two colours. */
export function backdrop(kind, c1, c2) {
  const b = layer(c1);
  const P = {
    dots: (x, y) => { const cx = Math.floor(x / 5) * 5 + 2.5 + (Math.floor(y / 5) % 2) * 2.5, cy = Math.floor(y / 5) * 5 + 2.5; return Math.hypot(x - cx, y - cy) < 1.3; },
    checker: (x, y) => (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0,
    stripes: (x, y) => Math.floor((x + y) / 3) % 2 === 0,
    vstripes: (x) => Math.floor(x / 3) % 2 === 0,
    rays: (x, y) => Math.floor(((Math.atan2(y - 16, x - 20) + Math.PI) / (2 * Math.PI)) * 16) % 2 === 0,
    waves: (x, y) => Math.sin(x * 0.55 + Math.floor(y / 3) * 1.7) * 1.1 + (y % 3) > 1.6,
    hearts: (x, y) => { const u = ((x % 7) + 7) % 7 - 3.5, v = ((y % 7) + 7) % 7 - 3; return (u * u + v * v - 2.2) ** 3 - u * u * v ** 3 * 1.6 < 0 && Math.floor(y / 7) % 2 === Math.floor(x / 7) % 2; },
    paws: (x, y) => { const cx = Math.floor(x / 8) * 8 + 4 + (Math.floor(y / 8) % 2) * 4, cy = Math.floor(y / 8) * 8 + 4; const dx = x - cx, dy = y - cy; return Math.hypot(dx, (dy - 1) * 1.2) < 1.8 || [[-2, -2], [0, -3], [2, -2]].some(([a, c]) => Math.hypot(dx - a, dy - c) < 0.9); },
    stars: (x, y) => { const cx = Math.floor(x / 6) * 6 + 3 + (Math.floor(y / 6) % 2) * 3, cy = Math.floor(y / 6) * 6 + 3; const dx = Math.abs(x - cx), dy = Math.abs(y - cy); return dx + dy < 1.6 || (dx < 0.6 && dy < 2.4) || (dy < 0.6 && dx < 2.4); },
    plain: () => false,
  };
  b.each((x, y) => P[kind](x, y), c2);
  return b;
}

/** Compose: backdrop, a frame of `fw` cells, then the subject with a dark outline. */
export function compose(bg, frameC, subj, { fw = 2, outline = 'D' } = {}) {
  const out = bg.g.map((r) => [...r]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (x < fw || y < fw || x >= N - fw || y >= N - fw) out[y][x] = frameC;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (subj.g[y][x] !== '.') { out[y][x] = subj.g[y][x]; continue; }
    if (!outline) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const v = subj.at(x + dx, y + dy); if (v !== undefined && v !== '.') { near = true; break; } }
    if (near) out[y][x] = outline;
  }
  return out.map((r) => r.join(''));
}

/** A cartoon eye: white, dark pupil, a glint. */
export function eye(s, x, y, r = 2.2, look = 0) {
  s.ell(x, y, r + 0.7, r * 1.1 + 0.7, 'D');
  s.ell(x, y, r, r * 1.1, 'W');
  s.ell(x + look, y + 0.3, r * 0.72, r * 0.82, 'D');
  if (r >= 2.4) s.dot(Math.floor(x + look - r * 0.25), Math.floor(y - r * 0.2), 'W');
}

/** The subject's transform: drawn in 40 × 40 design space, shown in rows 3..34 (under the HUD, mostly above the road), centred. */
export const SUBJECT = (() => { const k = 27 / N; return { k, ox: (N - N * k) / 2, oy: 2.5 }; })();

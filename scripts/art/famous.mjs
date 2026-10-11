// Famous pictures as 32×40 colour-key grids, drawn with simple shapes (cell centres sampled).
const W = 32, H = 40;
function canvas(bg) {
  const g = Array.from({ length: H }, () => Array(W).fill(bg));
  const each = (test, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (test(x + 0.5, y + 0.5)) g[y][x] = typeof c === 'function' ? c(x + 0.5, y + 0.5, g[y][x]) : c; };
  const api = {
    g, each,
    rows: (y0, y1, c) => each((x, y) => y >= y0 && y < y1, c),
    rect: (x0, y0, x1, y1, c) => each((x, y) => x >= x0 && x < x1 && y >= y0 && y < y1, c),
    ell: (cx, cy, rx, ry, c) => each((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, c),
    poly: (pts, c) => each((x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; }, c),
    line: (x0, y0, x1, y1, w, c) => each((x, y) => { const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy; const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2)); return Math.hypot(x - x0 - dx * t, y - y0 - dy * t) <= w / 2; }, c),
    dot: (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; },
    out: () => g.map((r) => r.join('')),
  };
  return api;
}

const P = {};

// 1. Eiffel Tower at sunset
{
  const a = canvas('P');
  a.rows(9, 18, 'K'); a.rows(18, 27, 'O'); a.rows(27, 34, 'Y');
  a.ell(24.5, 22, 4.5, 4.5, 'Y'); a.ell(24.5, 22, 2.5, 2.5, 'W');
  a.rows(34, 40, 'G');
  a.line(16, 0.5, 16, 5, 1, 'D');
  a.poly([[14.6, 4], [17.4, 4], [18.4, 13], [19.8, 20], [22.5, 29], [26.5, 37], [5.5, 37], [9.5, 29], [12.2, 20], [13.6, 13]], 'D');
  a.ell(16, 37.5, 5, 6, (x, y) => (y < 34 ? 'Y' : 'G'));
  a.rect(11.5, 13, 20.5, 14, 'Y'); a.rect(9.5, 20, 22.5, 21, 'Y'); a.rect(7, 29, 25, 30, 'Y');
  a.each((x, y) => y > 21 && y < 29 && Math.abs(x - 16) < 2.3 && a.g[Math.floor(y)][Math.floor(x)] === 'D', 'N');
  a.ell(5, 6, 3.5, 1.4, 'W'); a.ell(27, 4, 3, 1.2, 'W');
  P.eiffel = { name: 'Eiffel Tower', rows: a.out() };
}

// 2. The Great Wave
{
  const a = canvas('W');
  a.rows(0, 3, 'K');
  a.rows(28, 40, 'B');
  // the curling wave: an outer arch minus its hollow, lipped with foam claws
  a.each((x, y) => { const o = ((x - 12) / 15) ** 2 + ((y - 19) / 15) ** 2, i = ((x - 16) / 9.5) ** 2 + ((y - 21) / 9.5) ** 2; return o <= 1 && i > 1 && y < 33 && x < 26; }, 'B');
  a.each((x, y) => { const o = ((x - 12) / 15) ** 2 + ((y - 19) / 15) ** 2; return o <= 1 && o > 0.8 && y < 26 && x < 26; }, 'C');
  a.each((x, y) => { const o = Math.hypot((x - 12) / 15, (y - 19) / 15), ang = Math.atan2(y - 19, x - 12); return o <= 1.04 && o > 0.9 && y < 24 && x < 27 && Math.sin(ang * 14) > 0.1; }, 'W');
  a.each((x, y) => { const i = Math.hypot((x - 16) / 9.5, (y - 21) / 9.5), ang = Math.atan2(y - 21, x - 16); return i > 0.95 && i < 1.12 && y < 24 && x > 8 && x < 26 && Math.sin(ang * 12) > 0.3; }, 'W');
  // under the curl: the trough of the sea
  a.each((x, y) => { const i = ((x - 16) / 9.5) ** 2 + ((y - 21) / 9.5) ** 2; return i <= 1 && y > 22; }, 'B');
  a.each((x, y) => { const i = ((x - 16) / 9.5) ** 2 + ((y - 21) / 9.5) ** 2; return i <= 1 && y > 17 && y <= 22; }, 'C');
  // Mount Fuji in the trough
  a.poly([[17, 33], [22.5, 25.5], [28, 33]], 'B'); a.poly([[20.6, 28], [22.5, 25.5], [24.4, 28]], 'W');
  // the sea's stripes and boats
  a.each((x, y) => y >= 33 && Math.sin(x * 0.7 + y * 1.3) > 0.55, 'C');
  a.each((x, y) => y >= 33 && Math.sin(x * 0.7 + y * 1.3) > 0.9, 'W');
  a.line(3, 31, 12, 34, 1.4, 'Y'); a.line(18, 36.5, 28, 34.5, 1.4, 'Y');
  a.ell(26, 7, 3, 1.3, 'K'); a.ell(29, 12, 2.5, 1.1, 'K');
  P.wave = { name: 'The Great Wave', rows: a.out() };
}

// 3. The Starry Night
{
  const a = canvas('B');
  a.each((x, y) => y < 26 && Math.sin(Math.hypot(x - 15, y - 12) * 1.4 + Math.atan2(y - 12, x - 15) * 2) > 0.55, 'C');
  a.each((x, y) => y < 26 && Math.sin(Math.hypot(x - 15, y - 12) * 1.4 + Math.atan2(y - 12, x - 15) * 2) > 0.92, 'W');
  for (const [sx, sy] of [[6, 5], [19, 3.5], [10, 16], [22, 15], [29, 18]]) { a.ell(sx, sy, 3, 3, 'C'); a.ell(sx, sy, 2, 2, 'Y'); a.ell(sx, sy, 0.9, 0.9, 'W'); }
  a.ell(27, 6, 3.6, 3.6, 'O'); a.ell(27.8, 5.4, 2.6, 2.6, 'Y');
  // hills and the village
  a.each((x, y) => y > 25 + Math.sin(x * 0.3) * 1.5, 'D');
  a.each((x, y) => y > 28 + Math.sin(x * 0.45 + 1) * 1.2 && y < 34, 'B');
  for (const [hx, hy] of [[12, 32], [16, 33], [20, 31.5], [24, 33], [28, 32], [14, 36], [22, 36], [26, 37]]) { a.rect(hx - 1.5, hy - 1, hx + 1.5, hy + 1.5, 'N'); a.dot(Math.floor(hx), Math.floor(hy), 'Y'); }
  a.poly([[18, 26], [19, 31], [17, 31]], 'D');
  // the cypress
  a.poly([[5, 4], [7.5, 12], [9, 20], [10.5, 30], [11, 40], [1, 40], [2, 30], [3, 20], [3.6, 12]], 'D');
  a.each((x, y) => x < 11 && a.g[Math.floor(y)][Math.floor(x)] === 'D' && y < 38 && Math.sin(x * 2.1 + y * 0.9) > 0.6, 'G');
  P.starry = { name: 'The Starry Night', rows: a.out() };
}

// 4. Statue of Liberty
{
  const a = canvas('C');
  a.rows(0, 5, 'B');
  a.ell(5, 10, 4, 1.6, 'W'); a.ell(28, 17, 4, 1.8, 'W');
  a.rows(36, 40, 'B'); a.each((x, y) => y >= 36 && Math.sin(x * 0.8 + y * 2) > 0.7, 'W');
  a.rect(8, 33, 24, 40, 'N'); a.rect(9, 32, 23, 33, 'Y');
  a.poly([[8.5, 33], [23.5, 33], [22, 21], [19, 17.5], [13, 17.5], [10, 21]], 'G');
  a.ell(16, 13.5, 3.4, 4, 'G');
  for (let k = 0; k < 7; k++) { const ang = Math.PI * (1.05 + k * 0.15); a.line(16, 12, 16 + Math.cos(ang) * 7, 12 + Math.sin(ang) * 7, 1.1, 'G'); }
  a.line(20.5, 19, 24.5, 6.5, 3, 'G');
  a.rect(22.5, 4.5, 26.5, 7, 'Y'); a.ell(24.5, 2.6, 2, 2.4, 'O'); a.ell(24.5, 3.2, 1, 1.3, 'Y');
  a.poly([[7.5, 21], [12, 20], [13, 28], [8.5, 29]], 'G'); a.rect(8.4, 22, 11.8, 27.5, 'Y');
  a.each((x, y) => a.g[Math.floor(y)][Math.floor(x)] === 'G' && Math.sin(x * 1.5 - y * 0.6) > 0.72 && y > 20, 'C');
  a.dot(14, 13, 'D'); a.dot(17, 13, 'D'); a.dot(15, 15, 'C'); a.dot(16, 15, 'C');
  P.liberty = { name: 'Statue of Liberty', rows: a.out() };
}

// 5. Mona Lisa
{
  const a = canvas('G');
  a.each((x, y) => y < 14 && Math.sin(x * 0.4 + y * 0.6) > 0.3, 'C');
  a.rows(14, 40, 'N'); a.each((x, y) => y >= 14 && y < 24 && Math.sin(x * 0.5 - y) > 0.4, 'G');
  a.ell(16, 14, 8.5, 11, 'D');
  a.rect(7.5, 14, 10.5, 30, 'D'); a.rect(21.5, 14, 24.5, 30, 'D');
  a.poly([[3, 40], [29, 40], [27, 25], [21, 21.5], [11, 21.5], [5, 25]], 'D');
  a.each((x, y) => a.g[Math.floor(y)][Math.floor(x)] === 'D' && y > 26 && Math.sin(x * 1.3 + y * 0.4) > 0.6, 'N');
  a.ell(16, 13, 5.2, 7.2, 'S');
  a.rect(14, 19, 18, 23, 'S');
  a.poly([[11.5, 23], [20.5, 23], [19, 27.5], [13, 27.5]], 'S');
  a.line(11.5, 23, 20.5, 23, 0.7, 'Y');
  a.ell(13.5, 35, 4.2, 2.2, 'S'); a.ell(19, 34.2, 4.2, 2.2, 'S');
  a.dot(13, 11, 'D'); a.dot(18, 11, 'D'); a.dot(13, 10, 'N'); a.dot(18, 10, 'N');
  a.dot(16, 13, 'O'); a.dot(15, 15, 'R'); a.dot(16, 15, 'R'); a.dot(17, 15, 'R'); a.dot(14, 15, 'O'); a.dot(18, 14, 'O');
  P.mona = { name: 'Mona Lisa', rows: a.out() };
}

// 6. Mount Fuji with cherry blossom
{
  const a = canvas('C');
  a.rows(16, 26, 'W');
  a.ell(25, 6, 3.5, 3.5, 'R');
  a.poly([[0, 30], [12.5, 9], [19.5, 9], [32, 30]], 'B');
  a.poly([[9.5, 14], [12.5, 9], [19.5, 9], [22.5, 14], [20, 13], [18, 15], [16, 13], [14, 15], [12, 13]], 'W');
  a.rows(30, 40, 'G'); a.each((x, y) => y >= 30 && Math.sin(x * 0.9 + y) > 0.75, 'C');
  // the red pagoda
  for (let k = 0; k < 5; k++) { const y = 17 + k * 3, w = 2.2 + k * 0.6; a.rect(5 - w, y, 5 + w, y + 0.9, 'R'); a.rect(5 - w + 0.8, y + 0.9, 5 + w - 0.8, y + 3, 'D'); }
  a.rect(4.5, 14, 5.5, 17, 'D');
  // blossom
  for (const [bx, by, r] of [[1, 1, 4], [7, 2, 3], [2, 7, 3], [29, 33, 4], [24, 36, 3.5], [31, 27, 3]]) { a.ell(bx, by, r, r * 0.85, 'K'); }
  a.each((x, y) => a.g[Math.floor(y)][Math.floor(x)] === 'K' && Math.sin(x * 2.3 + y * 1.7) > 0.7, 'W');
  a.line(0, 3, 9, 5, 0.8, 'N'); a.line(32, 30, 22, 37, 0.8, 'N');
  P.fuji = { name: 'Mount Fuji', rows: a.out() };
}

// 7. Girl with a Pearl Earring
{
  const a = canvas('D');
  a.poly([[5, 40], [28, 40], [26, 30], [19, 27], [11, 28], [7, 31]], 'Y');
  a.each((x, y) => a.g[Math.floor(y)][Math.floor(x)] === 'Y' && Math.sin(x * 0.9 + y * 0.5) > 0.5, 'N');
  a.line(11, 29, 19, 28, 1.2, 'W');
  a.rect(13.5, 23, 18.5, 29, 'S');
  a.ell(15.5, 17, 6, 8, 'S');
  a.poly([[19, 6], [24.5, 7], [26, 24], [21.5, 19], [20, 12]], 'Y');
  a.ell(15.5, 9.5, 7.5, 5.2, 'B');
  a.ell(13.5, 8, 4, 2.4, 'C');
  a.ell(9.2, 12.5, 2.4, 3.5, 'Y');
  a.dot(13, 16, 'D'); a.dot(18, 16, 'D'); a.dot(12, 16, 'W'); a.dot(17, 16, 'W');
  a.dot(15, 19, 'O');
  a.dot(14, 21, 'R'); a.dot(15, 21, 'R'); a.dot(16, 21, 'R');
  a.ell(21.5, 24.2, 1.2, 1.5, 'W');
  P.pearl = { name: 'Girl with a Pearl Earring', rows: a.out() };
}

// 8. The Scream
{
  const a = canvas('O');
  a.each((x, y) => y < 17 && Math.sin(y * 0.9 + Math.sin(x * 0.35) * 1.6) > 0.35, 'R');
  a.each((x, y) => y < 17 && Math.sin(y * 0.9 + Math.sin(x * 0.35) * 1.6) < -0.6, 'Y');
  a.each((x, y) => y >= 15 && y < 30 && x > 9 + (y - 15) * 0.3, 'B');
  a.each((x, y) => y >= 15 && y < 30 && x > 9 + (y - 15) * 0.3 && Math.sin(x * 0.6 + y * 1.1) > 0.6, 'C');
  a.each((x, y) => y >= 15 && x <= 9 + (y - 15) * 0.3, 'G');
  a.each((x, y) => y >= 15 && x <= 9 + (y - 15) * 0.3 && Math.sin(x * 0.8 - y * 0.7) > 0.5, 'N');
  // the bridge, from the bottom right up to the left
  a.poly([[0, 22], [0, 25.5], [32, 40], [32, 33]], 'N');
  a.line(0, 21.5, 32, 32.5, 1, 'R'); a.line(0, 24.5, 32, 37, 0.8, 'O');
  a.ell(3, 20, 0.8, 1.6, 'D'); a.ell(5.5, 21, 0.8, 1.6, 'D');
  // the figure
  a.poly([[9, 40], [21, 40], [18.5, 30], [12, 30]], 'D');
  a.each((x, y) => a.g[Math.floor(y)][Math.floor(x)] === 'D' && y > 31 && Math.sin(x * 1.2 + y * 0.5) > 0.7, 'B');
  a.ell(15, 24.5, 3.4, 4.6, 'W');
  a.ell(11, 25.5, 1.4, 2.8, 'W'); a.ell(19, 25.5, 1.4, 2.8, 'W');
  a.dot(14, 23, 'D'); a.dot(16, 23, 'D'); a.ell(15, 27, 0.9, 1.4, 'D');
  P.scream = { name: 'The Scream', rows: a.out() };
}

// 9. The Pyramids of Giza
{
  const a = canvas('C');
  a.rows(0, 8, 'B');
  a.ell(25, 6, 3.6, 3.6, 'Y'); a.ell(25, 6, 2, 2, 'W');
  a.ell(6, 8, 3.5, 1.3, 'W');
  a.poly([[-1, 31], [11, 9], [23, 31]], 'Y'); a.poly([[11, 9], [23, 31], [11, 31]], 'O');
  a.poly([[18, 31], [26, 17], [34, 31]], 'Y'); a.poly([[26, 17], [34, 31], [26, 31]], 'O');
  a.each((x, y) => a.g[Math.floor(y)][Math.floor(x)] === 'O' && Math.floor(y) % 3 === 0, 'N');
  a.rows(31, 40, 'Y'); a.each((x, y) => y >= 31 && Math.sin(x * 0.4 + y * 0.9) > 0.55, 'O');
  // the sphinx
  a.rect(2, 30, 11, 33, 'N'); a.ell(10, 28.6, 1.8, 2, 'N'); a.rect(8.5, 27, 11.5, 27.8, 'B');
  // a camel train
  for (const cx of [19, 23, 27]) { a.ell(cx, 35, 1.6, 0.9, 'D'); a.line(cx + 1.4, 35, cx + 2, 33.6, 0.7, 'D'); a.line(cx - 0.8, 35.5, cx - 0.8, 37, 0.5, 'D'); a.line(cx + 0.8, 35.5, cx + 0.8, 37, 0.5, 'D'); }
  P.giza = { name: 'Pyramids of Giza', rows: a.out() };
}

// 10. Sunflowers (Van Gogh)
{
  const a = canvas('C');
  a.rows(27, 40, 'Y'); a.rows(27, 28, 'O');
  // the vase
  a.ell(16, 32, 6.5, 6.5, 'O'); a.rect(11, 25.5, 21, 30, 'O'); a.rect(10.5, 25, 21.5, 26.5, 'Y');
  a.line(9.5, 31, 22.5, 31, 1.2, 'B');
  a.each((x, y) => a.g[Math.floor(y)][Math.floor(x)] === 'O' && y > 32 && x < 13, 'N');
  // stems and leaves
  for (const [x0, y0] of [[8, 8], [16, 5], [24, 8], [11, 16], [21, 16], [5, 18], [27, 19]]) a.line(16, 26, x0, y0, 0.9, 'G');
  a.ell(9, 22, 2.6, 1.2, 'G'); a.ell(23, 22, 2.6, 1.2, 'G');
  // the flower heads: yellow petals round a brown seed disc
  for (const [x0, y0, r] of [[8, 8, 4.2], [16, 5, 4.4], [24, 8, 4.2], [11, 16, 3.8], [21, 16, 3.8], [5, 18, 3], [27, 19, 3]]) {
    a.each((x, y) => { const d = Math.hypot(x - x0, y - y0), ang = Math.atan2(y - y0, x - x0); return d <= r * (0.82 + 0.18 * Math.cos(ang * 8)); }, 'Y');
    a.ell(x0, y0, r * 0.42, r * 0.42, 'N');
    a.each((x, y) => Math.hypot(x - x0, y - y0) <= r * 0.42 && Math.sin(x * 3 + y * 3) > 0.6, 'O');
  }
  P.sunflowers = { name: 'Sunflowers', rows: a.out() };
}

// 11. Taj Mahal
{
  const a = canvas('C');
  a.rows(0, 6, 'B');
  a.rows(29, 40, 'G'); a.rect(13, 29, 19, 40, 'B'); a.each((x, y) => y >= 29 && x >= 13 && x < 19 && Math.sin(y * 1.6) > 0.6, 'C');
  // the minarets
  for (const mx of [3.5, 28.5]) { a.rect(mx - 1, 12, mx + 1, 29, 'W'); a.ell(mx, 11.5, 1.6, 1.6, 'W'); a.line(mx, 9, mx, 10.5, 0.5, 'Y'); a.rect(mx - 1.6, 17, mx + 1.6, 17.8, 'P'); a.rect(mx - 1.6, 23, mx + 1.6, 23.8, 'P'); }
  // the body and the great dome
  a.rect(7, 18, 25, 29, 'W');
  a.rect(6.5, 28, 25.5, 29, 'P');
  a.ell(16, 13, 6.2, 6.5, 'W'); a.poly([[13.5, 7.5], [16, 3], [18.5, 7.5]], 'W'); a.line(16, 1, 16, 3.5, 0.6, 'Y');
  a.rect(10, 16.5, 22, 18.5, 'W');
  a.ell(9.5, 16.5, 2, 2, 'W'); a.ell(22.5, 16.5, 2, 2, 'W');
  // the arches
  a.poly([[13, 29], [13, 22], [16, 19.5], [19, 22], [19, 29]], 'P'); a.poly([[14, 29], [14, 22.5], [16, 20.8], [18, 22.5], [18, 29]], 'D');
  for (const ax of [9.5, 22.5]) { a.poly([[ax - 1.5, 27], [ax - 1.5, 23], [ax, 21.6], [ax + 1.5, 23], [ax + 1.5, 27]], 'P'); }
  a.each((x, y) => a.g[Math.floor(y)][Math.floor(x)] === 'W' && Math.hypot(x - 16, y - 13) < 6.2 && x > 18.5, 'P');
  P.taj = { name: 'Taj Mahal', rows: a.out() };
}

const order = process.argv.slice(2);
const out = (order.length ? order : Object.keys(P)).map((k) => P[k]);
console.log(JSON.stringify(out));

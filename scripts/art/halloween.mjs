// Halloween pictures for the levels in the Halloween look (see SCHEDULE in src/levels.ts).
// Run: node scripts/art/halloween.mjs > halloween.json, then merge into BOARD_PICS (pictures.ts).
import { layer, backdrop, compose, eye, SUBJECT } from './lib.mjs';
const P = [];
const add = (level, name, bgKind, c1, c2, frame, draw, opts) => { const s = layer('.', SUBJECT); draw(s); P.push({ level, name, rows: compose(backdrop(bgKind, c1, c2), frame, s, opts) }); };
const smile = (s, x, y, w, c = 'D') => s.ring(x, y - w * 0.6, w * 0.9, w * 0.9 + 0.9, c, 0.5, Math.PI - 0.5);
const cheeks = (s, x0, x1, y, r = 1.6) => { s.ell(x0, y, r, r * 0.7, 'K'); s.ell(x1, y, r, r * 0.7, 'K'); };

add(6, 'Cute Ghost', 'stars', 'P', 'Y', 'O', (s) => {
  s.ell(20, 15, 14, 13, 'W');
  s.rect(6, 15, 34, 33, 'W');
  for (let k = 0; k < 5; k++) s.ell(8.8 + k * 5.6, 33, 2.9, 3, k % 2 ? '.' : 'W');
  s.ell(4.5, 22, 3, 4.5, 'W'); s.ell(35.5, 20, 3, 4.5, 'W');
  s.ell(14.5, 15, 2.2, 3, 'D'); s.ell(25.5, 15, 2.2, 3, 'D'); s.dot(14, 13, 'W'); s.dot(25, 13, 'W');
  s.ell(20, 22, 2.6, 2.2, 'D'); s.ell(20, 23, 1.6, 1, 'R'); cheeks(s, 10.5, 29.5, 20, 1.7);
});
add(7, 'Black Cat', 'checker', 'P', 'K', 'O', (s) => {
  s.poly([[4, 1], [14, 9], [6, 17]], 'D'); s.poly([[36, 1], [26, 9], [34, 17]], 'D');
  s.poly([[6, 5], [11, 9], [8, 13]], 'K'); s.poly([[34, 5], [29, 9], [32, 13]], 'K');
  s.ell(20, 20, 17, 14, 'D');
  s.ell(13, 18, 3.4, 3.8, 'Y'); s.ell(13, 18.5, 1.2, 3, 'D'); s.ell(27, 18, 3.4, 3.8, 'Y'); s.ell(27, 18.5, 1.2, 3, 'D');
  s.poly([[18, 24], [22, 24], [20, 26]], 'K');
  s.poly([[15, 31], [20, 29], [25, 31], [20, 33]], 'R'); s.ell(20, 31, 1.4, 1.4, 'R');
  for (const sy of [-1, 1]) { s.line(3, 24 + sy * 2, 12, 25, 0.5, 'W'); s.line(37, 24 + sy * 2, 28, 25, 0.5, 'W'); }
});
add(8, 'Candy Corn', 'dots', 'P', 'K', 'O', (s) => {
  s.poly([[20, 1], [33, 35], [7, 35]], 'W'); s.tint('W', (x, y) => y > 23, 'Y'); s.tint('Y', (x, y) => y > 30, 'O');
  s.tint('W', (x, y) => y > 12, 'O'); s.tint('O', (x, y) => y > 23 && y <= 30, 'Y');
  eye(s, 16, 19, 1.8); eye(s, 24, 19, 1.8); smile(s, 20, 25, 2.2); cheeks(s, 12.5, 27.5, 23, 1.2);
});
add(9, 'Witch Hat', 'stars', 'B', 'Y', 'P', (s) => {
  s.ell(20, 31, 19, 5.5, 'P');
  s.poly([[9, 30], [31, 30], [24, 10], [30, 2], [19, 8]], 'P');
  s.rect(9.5, 24, 30.5, 28, 'O'); s.rect(17, 23.5, 23, 28.5, 'Y'); s.rect(18.5, 25, 21.5, 27, 'P');
  s.tint('P', (x, y) => y < 28 && x > 24, 'D');
  s.ell(32, 6, 2.5, 2.5, 'Y');
});
add(21, 'Night Bat', 'stars', 'B', 'Y', 'P', (s) => {
  s.ell(20, 12, 14, 14, 'Y'); s.tint('Y', (x, y) => Math.hypot(x - 15, y - 8) < 3, 'O');
  s.poly([[20, 19], [2, 12], [5, 20], [1, 26], [9, 24], [12, 30], [20, 25], [28, 30], [31, 24], [39, 26], [35, 20], [38, 12]], 'D');
  s.ell(20, 22, 5, 5.5, 'D'); s.poly([[16, 18], [17, 13], [19, 17]], 'D'); s.poly([[24, 18], [23, 13], [21, 17]], 'D');
  s.ell(18, 21, 1.2, 1.2, 'R'); s.ell(22, 21, 1.2, 1.2, 'R'); s.poly([[18.5, 24], [19.5, 24], [19, 25.5]], 'W'); s.poly([[20.5, 24], [21.5, 24], [21, 25.5]], 'W');
}, { outline: 'P' });
add(22, 'Haunted House', 'stars', 'B', 'P', 'O', (s) => {
  s.ell(30, 6, 6, 6, 'Y');
  s.rect(9, 16, 31, 36, 'D'); s.poly([[7, 17], [20, 4], [33, 17]], 'D'); s.rect(25, 6, 28, 13, 'D');
  s.poly([[24, 12], [30, 4], [36, 12]], 'D'); s.rect(26, 12, 34, 22, 'D');
  for (const [x, y] of [[12, 20], [17, 20], [23, 20], [28.5, 15], [12, 27], [23, 27]]) s.rect(x, y, x + 3, y + 3.5, 'Y');
  s.rect(16.5, 28, 20.5, 36, 'N'); s.ell(18.5, 28, 2, 1.5, 'N');
  s.ell(20, 12, 2, 2, 'O');
}, { outline: 'P' });
add(23, 'Spooky Spider', 'dots', 'G', 'Y', 'P', (s) => {
  s.line(20, 0, 20, 8, 0.6, 'W');
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) s.path([[20 + sx * 6, 15 + k * 3], [20 + sx * 13, 10 + k * 4], [20 + sx * 18, 18 + k * 5]], 1.4, 'D');
  s.ell(20, 22, 9, 9, 'D'); s.ell(20, 12, 6, 5.5, 'D');
  s.ell(17.5, 12, 1.8, 2, 'W'); s.ell(22.5, 12, 1.8, 2, 'W'); s.ell(17.5, 12.5, 1, 1.2, 'R'); s.ell(22.5, 12.5, 1, 1.2, 'R');
  s.ell(20, 23, 4, 4, 'O'); s.ell(20, 23, 2, 2, 'R');
}, { outline: 'P' });
add(39, 'Magic Cauldron', 'stars', 'B', 'G', 'O', (s) => {
  for (const [x, y, r] of [[13, 8, 3], [20, 4, 3.5], [27, 9, 2.6], [17, 1.5, 1.8]]) s.ell(x, y, r, r, 'G');
  s.ell(20, 25, 15, 11, 'D'); s.rect(4, 13, 36, 17, 'D'); s.ell(20, 15, 15, 3, 'G'); s.ell(20, 15, 12, 2, 'Y');
  s.rect(8, 34, 11, 38, 'D'); s.rect(29, 34, 32, 38, 'D');
  s.ell(12, 22, 1.8, 3, 'N');
  for (const x of [8, 16, 24, 32]) s.poly([[x - 2, 38], [x, 33], [x + 2, 38]], 'O');
});
add(41, 'Mummy Friend', 'stars', 'P', 'Y', 'O', (s) => {
  s.ell(20, 20, 16, 16, 'W');
  s.tint('W', (x, y) => Math.floor(y + x * 0.25) % 4 === 0, 'N');
  s.rect(7, 13, 33, 21, 'D');
  s.ell(14, 17, 3, 3, 'Y'); s.ell(26, 17, 3, 3, 'Y'); s.ell(14, 17, 1.4, 1.6, 'D'); s.ell(26, 17, 1.4, 1.6, 'D');
  smile(s, 20, 30, 2.4); cheeks(s, 11, 29, 25, 1.4);
});
add(42, 'Sugar Skull', 'hearts', 'P', 'K', 'O', (s) => {
  s.ell(20, 16, 16, 14, 'W'); s.rect(11, 22, 29, 34, 'W'); s.ell(20, 33, 9, 3, 'W');
  s.ell(13.5, 16, 4.5, 5, 'D'); s.ell(26.5, 16, 4.5, 5, 'D');
  s.ell(13.5, 16, 2.6, 2.8, 'C'); s.ell(26.5, 16, 2.6, 2.8, 'K');
  s.poly([[18, 25], [22, 25], [20, 22]], 'D');
  for (let k = 0; k < 6; k++) s.rect(12.5 + k * 2.6, 29, 13.8 + k * 2.6, 32, 'D');
  for (const [x, y, c] of [[20, 6, 'R'], [16, 8, 'Y'], [24, 8, 'Y'], [8, 22, 'G'], [32, 22, 'G']]) s.ell(x, y, 1.6, 1.6, c);
});
add(43, 'Little Vampire', 'stars', 'B', 'Y', 'R', (s) => {
  s.poly([[2, 36], [8, 20], [20, 26], [32, 20], [38, 36]], 'D'); s.poly([[6, 24], [8, 20], [14, 24], [8, 30]], 'R'); s.poly([[34, 24], [32, 20], [26, 24], [32, 30]], 'R');
  s.ell(20, 16, 12, 12, 'W'); s.tint('W', () => true, 'P');
  s.poly([[8, 12], [20, 3], [32, 12], [20, 8]], 'D');
  s.ell(15.5, 15, 2.2, 2.4, 'W'); s.ell(24.5, 15, 2.2, 2.4, 'W'); s.ell(15.5, 15.5, 1.2, 1.4, 'R'); s.ell(24.5, 15.5, 1.2, 1.4, 'R');
  s.ring(20, 18, 4, 5, 'D', 0.3, Math.PI - 0.3); s.poly([[17.5, 22], [18.5, 22], [18, 24]], 'W'); s.poly([[21.5, 22], [22.5, 22], [22, 24]], 'W');
  s.rect(17, 27, 23, 29, 'W'); s.ell(20, 28, 1.2, 1.2, 'R');
});
add(44, 'Trick or Treat', 'checker', 'P', 'O', 'G', (s) => {
  // a lollipop and two wrapped sweets
  s.line(11, 18, 11, 38, 1.6, 'W'); s.ell(11, 11, 9, 9, 'K');
  s.ring(11, 11, 2, 3.4, 'W'); s.ring(11, 11, 5.4, 6.8, 'W');
  s.ell(27, 12, 6, 4.5, 'R'); s.poly([[21, 12], [17, 8], [17, 16]], 'R'); s.poly([[33, 12], [37, 8], [37, 16]], 'R');
  s.tint('R', (x, y) => Math.abs(x - 27) < 4 && Math.floor(x - y) % 3 === 0, 'Y');
  s.ell(27, 28, 6, 4.5, 'B'); s.poly([[21, 28], [17, 24], [17, 32]], 'B'); s.poly([[33, 28], [37, 24], [37, 32]], 'B');
  s.tint('B', (x, y) => Math.abs(x - 27) < 4 && Math.floor(x + y) % 3 === 0, 'C');
});
console.log(JSON.stringify(P));

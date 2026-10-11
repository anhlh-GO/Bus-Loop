// The 12 checks of the Vehicle-Centered Conditional Radius Boarding spec (section I),
// run on a real level. Run: node scripts/radius-test.ts
import { generate, paramsOf } from '../src/levels.ts';
import { BOARD_TICKS, EMPTY, Sim, type SimBus } from '../src/sim.ts';

type Raw = Sim & { board(b: SimBus, at: number, ev: unknown[]): boolean; touchesAccess(i: number): boolean };
const spec = generate(0, 1, paramsOf(0))!;
let failed = 0;
function check(name: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
// the tests check the normal radius: keep the lot full so the final rush never starts
const fresh = (): Raw => { const s = new Sim(spec) as Raw; s.rushOn = () => false; return s; };
const BOARD_RADIUS = fresh().boardRadius;
const dist = (s: Sim, i: number, x: number, y: number): number => Math.hypot(s.x[i] - x, s.y[i] - y);

/** A bus of `colour` standing on road point `at`, with `cap` seats. */
function busAt(s: Sim, at: number, colour: number, cap: number, id = 0): SimBus {
  const b = s.buses[id];
  b.color = colour; b.cap = cap; b.where = 'road'; b.pos = at; b.pos0 = at; b.v = 0; b.phase = 'search'; b.group = [];
  return b;
}
/** A road point on the stem's left lane whose zone holds a seed (boardable, its colour) and more of that colour. */
function setup(s: Sim): { at: number; colour: number; seed: number } {
  for (let at = 0; at < s.lapLen; at++) {
    const q = s.pts[at];
    if (q.x > s.geo.cx || q.y < s.geo.cyU + 2 || q.y > s.geo.H - 6) continue;
    for (const i of s.near[at]) {
      if (!s.boardable(i)) continue;
      const colour = s.color[i];
      const more = [...Array(s.n).keys()].filter((k) => k !== i && s.color[k] === colour && dist(s, k, q.x, q.y) <= BOARD_RADIUS).length;
      if (more >= 3) return { at, colour, seed: i };
    }
  }
  throw new Error('no test spot');
}

{
  // 1. no seed: radius stays off
  const s = fresh();
  const { at, colour } = setup(s);
  const b = busAt(s, at, colour, 50);
  for (const i of s.near[at]) if (s.color[i] === colour) s.color[i] = (colour + 1) % 11; // no passenger of its colour near
  const ev: unknown[] = [];
  s.board(b, at, ev);
  check('1 no seed: the radius is not opened', b.phase === 'search' && ev.length === 0);
}
{
  // 2 + 4 + 5 + 9. a seed opens the radius once; joiners are its colour within the radius round the bus
  const s = fresh();
  const { at, colour, seed } = setup(s);
  const b = busAt(s, at, colour, 50);
  const ev: { t: string; cell: number; color: number }[] = [];
  s.board(b, at, ev as unknown[]);
  const q = s.pts[at];
  const takes = ev.filter((e) => e.t === 'take');
  check('2 a seed opens the radius exactly once (one group reserved)', b.phase === 'boarding' && b.seed === seed && takes.length > 1);
  const joiners = takes.filter((e) => e.cell !== seed);
  check('4 joiners lie within the radius of the bus (wherever they are relative to the seed)', joiners.every((e) => dist(s, e.cell, q.x, q.y) <= BOARD_RADIUS + 1e-9));
  check('5 nobody of another colour joins', takes.every((e) => e.color === colour));
  check('9 after reserving, no new pick without a new seed against the road', !s.board(b, at, []) || b.phase === 'boarding');
}
{
  // 3. same colour next to the seed but outside the bus's radius: not taken
  const s = fresh();
  const { at, colour, seed } = setup(s);
  const q = s.pts[at];
  // the passenger just outside the bus's radius that stands nearest the seed
  const far = [...Array(s.n).keys()].filter((k) => k !== seed && dist(s, k, q.x, q.y) > BOARD_RADIUS)
    .sort((i, j) => dist(s, i, s.x[seed], s.y[seed]) - dist(s, j, s.x[seed], s.y[seed]))[0];
  if (far !== undefined) s.color[far] = colour;
  const b = busAt(s, at, colour, 50);
  const ev: { t: string; cell: number }[] = [];
  s.board(b, at, ev as unknown[]);
  check('3 same colour beside the seed but outside the bus radius is not taken', far !== undefined && !ev.some((e) => e.cell === far));
}
{
  // 6. a joiner enclosed by other colours inside the radius still boards
  const s = fresh();
  const { at, colour, seed } = setup(s);
  const q = s.pts[at];
  const inner = [...Array(s.n).keys()].find((k) => k !== seed && dist(s, k, q.x, q.y) <= BOARD_RADIUS && !s.touchesAccess(k));
  if (inner !== undefined) s.color[inner] = colour;
  const b = busAt(s, at, colour, 50);
  const ev: { t: string; cell: number }[] = [];
  s.board(b, at, ev as unknown[]);
  check('6 an enclosed passenger of its colour inside the radius joins', inner !== undefined && ev.some((e) => e.cell === inner));
}
{
  // 7. never past the seats left
  const s = fresh();
  const { at, colour } = setup(s);
  const b = busAt(s, at, colour, 2);
  const ev: { t: string }[] = [];
  s.board(b, at, ev as unknown[]);
  check('7 many valid passengers: no more than the seats left', ev.filter((e) => e.t === 'take').length === 2 && b.cap === 0);
}
{
  // 8. the bus moves on: the activation's centre does not
  const s = fresh();
  const { at, colour } = setup(s);
  const b = busAt(s, at, colour, 50);
  s.board(b, at, []);
  const cx = b.cx, cy = b.cy, group = [...b.group];
  b.pos = (at + 3) % s.lapLen;
  s.board(b, (at + 3) % s.lapLen, []);
  check('8 moving after activation keeps the frozen centre and the same group', b.cx === cx && b.cy === cy && b.group.join() === group.join());
}
{
  // 10. after the group is aboard, a new radius needs a new seed
  const s = fresh();
  const { at, colour } = setup(s);
  const b = busAt(s, at, colour, 50);
  s.board(b, at, []);
  const first = b.seed;
  // the group boards one by one: wait until the last of them is aboard
  for (let k = 0; k < BOARD_TICKS + 200 && b.phase === 'boarding'; k++) s.board(b, at, []);
  const backToSearch = b.phase === 'search' && b.group.length === 0;
  const ev: { t: string }[] = [];
  const again = s.board(b, at, ev as unknown[]);
  check('10 a further activation starts only from a new seed', backToSearch && (!again || (b.seed !== first && b.seed >= 0)));
}
{
  // 11. across the stem (the other side of the U) is not served
  const s = fresh();
  const { at, colour } = setup(s);
  const q = s.pts[at];
  const across = [...Array(s.n).keys()].filter((k) => s.x[k] > s.geo.cx && dist(s, k, q.x, q.y) <= BOARD_RADIUS + 6);
  for (const k of across) s.color[k] = colour;
  const b = busAt(s, at, colour, 500);
  const ev: { t: string; cell: number }[] = [];
  s.board(b, at, ev as unknown[]);
  check('11 passengers across the stem are not taken', !ev.some((e) => s.x[e.cell] > s.geo.cx));
}
{
  // 12. two buses never reserve the same passenger
  const s = fresh();
  const { at, colour } = setup(s);
  const a = busAt(s, at, colour, 50, 0), z = busAt(s, at, colour, 50, 1);
  const ea: { cell: number }[] = [], ez: { cell: number }[] = [];
  s.board(a, at, ea as unknown[]);
  s.board(z, at, ez as unknown[]);
  const set = new Set(ea.map((e) => e.cell));
  check('12 a passenger is never picked by two buses', ez.every((e) => !set.has(e.cell)));
}
{
  // 13. the final rush (six buses or fewer left): the radius doubles
  const s = new Sim(spec) as Raw;
  const { at, colour } = setup(s);
  for (const o of s.buses.slice(6)) o.where = 'gone';
  const b = busAt(s, at, colour, 500);
  const q = s.pts[at];
  const ev: { t: string; cell: number }[] = [];
  s.board(b, at, ev as unknown[]);
  const far = ev.filter((e) => e.t === 'take' && dist(s, e.cell, q.x, q.y) > BOARD_RADIUS);
  check('13 final rush: joiners come from up to twice the radius', s.rushOn() && far.length > 0 && ev.every((e) => dist(s, e.cell, q.x, q.y) <= BOARD_RADIUS * 2 + 1e-9 || e.cell === b.seed));
}
{
  // 14. passengers right against the road board by default, even while a group is boarding,
  // and each opens the radius again at the bus's current position
  const s = fresh();
  const { at, colour } = setup(s);
  const b = busAt(s, at, colour, 500);
  s.board(b, at, []);
  const first = { cx: b.cx, cy: b.cy };
  // move on a few points and put a passenger of its colour against the road there
  let next = -1, curb = -1;
  for (let k = 3; k < 12 && curb < 0; k++) {
    const a2 = (at + k) % s.lapLen;
    const c = [...s.near[a2]].find((i) => s.color[i] >= 0 && s.touchesRoad(i));
    if (c !== undefined) { next = a2; curb = c; }
  }
  s.color[curb] = colour;
  s.crate[curb] = 0;
  const ev: { t: string; cell: number }[] = [];
  s.board(b, next, ev as unknown[]);
  check('14 a passenger against the road boards by default during boarding, reopening the radius at the bus',
    b.phase === 'boarding' && ev.some((e) => e.cell === curb) && (b.cx !== first.cx || b.cy !== first.cy));
}
void EMPTY;
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);

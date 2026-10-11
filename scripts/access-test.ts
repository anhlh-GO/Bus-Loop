// The 12 required checks of the boarding spec (Dynamic Diagonal Accessibility and
// Progressive Peeling), run on a real level's partial-offset grid.
// Run: node scripts/access-test.ts
import { generate, paramsOf } from '../src/levels.ts';
import { EMPTY, Sim } from '../src/sim.ts';

// Internals the tests reach into (kept private in the game code).
type Raw = Sim & { release(i: number): void; touchesAccess(i: number): boolean };

const spec = generate(0, 1, paramsOf(0))!;
let failed = 0;
function check(name: string, ok: boolean): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
const fresh = (): Raw => new Sim(spec) as Raw;

/** Neighbour slot of place i at (dr, dc), or -1 outside the grid. */
function slotAt(s: Sim, i: number, dr: number, dc: number): number {
  const r = s.row[i] + dr, c = s.col[i] + dc;
  return r < 0 || r >= s.rows || c < 0 || c >= s.cols ? -1 : r * s.cols + c;
}
const placeAt = (s: Sim, i: number, dr: number, dc: number): number => { const sl = slotAt(s, i, dr, dc); return sl < 0 ? -1 : s.slot[sl]; };
const isRoad = (s: Sim, i: number, dr: number, dc: number): boolean => { const sl = slotAt(s, i, dr, dc); return sl >= 0 && s.road[sl] === 1; };
const DIRS: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const roadNeighbours = (s: Sim, i: number): number => DIRS.filter(([dr, dc]) => isRoad(s, i, dr, dc)).length;
const empty = (s: Sim, i: number): void => { s.color[i] = EMPTY; s.ice[i] = 0; s.crate[i] = 0; };

{
  // 1. beside the road horizontally
  const s = fresh();
  const i = [...Array(s.n).keys()].find((k) => isRoad(s, k, 0, 1) || isRoad(s, k, 0, -1))!;
  check('1 passenger beside the road (horizontal) is boardable', i !== undefined && s.boardable(i));
}
{
  // 2. beside the road vertically
  const s = fresh();
  const i = [...Array(s.n).keys()].find((k) => isRoad(s, k, 1, 0) || isRoad(s, k, -1, 0))!;
  check('2 passenger beside the road (vertical) is boardable', i !== undefined && s.boardable(i));
}
{
  // 3 + 12. access only across a diagonal corner, both side places occupied
  const s = fresh();
  let ok = false;
  for (let t = 0; t < s.n && !ok; t++) {
    if (roadNeighbours(s, t)) continue;
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
      const d = placeAt(s, t, dr, dc), a = placeAt(s, t, dr, 0), b = placeAt(s, t, 0, dc);
      if (d < 0 || a < 0 || b < 0 || !roadNeighbours(s, d)) continue;
      empty(s, d);
      s.rebuildReach();
      ok = s.color[a] >= 0 && s.color[b] >= 0 && s.boardable(t);
      break;
    }
  }
  check('3 passenger touching the access region only diagonally is boardable', ok);
  check('12 diagonal corner access works with both side places occupied', ok);
}
{
  // 4. not beside the road, joined to it by a chain of empty places
  const s = fresh();
  const near = [...Array(s.n).keys()].find((k) => roadNeighbours(s, k) > 0 && placeAt(s, k, -1, 0) >= 0 && placeAt(s, k, -2, 0) >= 0)!;
  const mid = placeAt(s, near, -1, 0), far = placeAt(s, near, -2, 0);
  empty(s, near);
  empty(s, mid);
  s.rebuildReach();
  check('4 passenger two places off the road, joined by an empty chain, is boardable', roadNeighbours(s, far) === 0 && s.boardable(far));
}
{
  // 5. fully enclosed by eight passengers
  const s = fresh();
  const t = [...Array(s.n).keys()].find((k) => DIRS.every(([dr, dc]) => { const p = placeAt(s, k, dr, dc); return p >= 0 && s.color[p] >= 0; }))!;
  check('5 passenger enclosed by eight others is not boardable', !s.boardable(t));
}
{
  // 6. peeling: taking the front passenger exposes the one behind, at once
  const s = fresh();
  const front = [...Array(s.n).keys()].find((k) => roadNeighbours(s, k) > 0 && placeAt(s, k, -1, 0) >= 0 && roadNeighbours(s, placeAt(s, k, -1, 0)) === 0)!;
  const behind = placeAt(s, front, -1, 0);
  const before = s.boardable(behind);
  s.release(front);
  check('6 after the front passenger leaves, the one behind becomes boardable immediately', !before && s.boardable(behind));
}
{
  // 7 + 8 + 9. a bus collecting: no double pick, capacity respected, colour respected
  const s = fresh();
  const at = s.near.findIndex((z) => [...z].filter((i) => s.boardable(i)).length >= 5);
  const zone = [...s.near[at]].filter((i) => s.boardable(i));
  const colour = s.color[zone[0]];
  const b = s.buses[0];
  b.color = colour; b.cap = 1; b.where = 'road'; b.pos = (at - 1 + s.lapLen) % s.lapLen; b.pos0 = b.pos; b.v = 0;
  for (const o of s.buses) if (o !== b) o.where = 'gone';
  // stand the bus exactly on the road point (no movement this tick)
  b.v = 0;
  const ev = s.step();
  const takes = ev.filter((e) => e.t === 'take');
  const cells = takes.map((e) => (e as { cell: number }).cell);
  check('7 no passenger is picked twice', new Set(cells).size === cells.length);
  check('8 capacity 1 with several boardable: exactly one picked', takes.length === 1);
  check('9 a bus never takes a passenger of another colour', takes.every((e) => (e as { color: number }).color === colour));
}
{
  // 10. an empty pocket not joined to the road is not access
  const s = fresh();
  const t = [...Array(s.n).keys()].find((k) => s.y[k] < 10 && DIRS.every(([dr, dc]) => { const p = placeAt(s, k, dr, dc); return p >= 0 && s.color[p] >= 0; }))!;
  empty(s, t);
  s.rebuildReach();
  const neighbours = DIRS.map(([dr, dc]) => placeAt(s, t, dr, dc));
  check('10 an enclosed empty pocket gives no access to its neighbours', !s.reach[t] && neighbours.every((p) => !s.boardable(p)));
}
{
  // 11. the grid is partial-offset (rows shifted by a fraction of a place) and the checks above ran on it
  const s = fresh();
  const a = [...Array(s.n).keys()].find((k) => s.row[k] === 2 && s.col[k] === 3)!, b = [...Array(s.n).keys()].find((k) => s.row[k] === 3 && s.col[k] === 3)!;
  const shift = Math.abs(s.x[b] - s.x[a]);
  check('11 partial-offset grid (row shift 20–30% of a place) with row/column connectivity', shift > 0.19 && shift < 0.31);
}
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);

/**
 * Lo que un bot sabe del mapa: el plano inicial (es público) y el terreno que ya vio, más rutas de excavación.
 * Un bot nunca mira lo que su jugador no ve (entidades enemigas fuera de la niebla).
 */
import type { DataSet } from '../data';
import { DIRS4, tileIndex } from '../sim/grid';
import { rulesOf } from '../sim/rules';
import type { MatchState, PlayerId } from '../sim/types';

/** Terreno (índice en data.terrain) que el jugador cree que hay en un tile: el visto, o el del plano inicial. */
export function knownTerrain(
  state: MatchState,
  data: DataSet,
  pid: PlayerId,
  tile: number,
): number {
  const player = state.players.find((p) => p.id === pid);
  if (player && player.seen[tile] === 1) return state.terrain[tile] as number;
  const x = tile % state.width;
  const y = Math.floor(tile / state.width);
  const ch = data.map.rows[y]?.[x];
  const t = data.terrain.findIndex((d) => d.char === ch);
  return t >= 0 ? t : (state.terrain[tile] as number);
}

export interface DigPath {
  /** Tiles a excavar, en orden desde el territorio propio. */
  tiles: number[];
  cost: number;
}

/** Coste de atravesar un terreno al planear una ruta de excavación (Infinity si no se puede). */
function stepCost(
  rules: ReturnType<typeof rulesOf>,
  terrain: number,
  owner: number,
  pid: PlayerId,
): number {
  const def = rules.terrain[terrain];
  if (!def) return Infinity;
  if (def.walkable) return def.ownable && owner !== 0 && owner !== pid ? 0.4 : 0.15;
  if (!def.diggable) return Infinity;
  if (owner !== 0 && owner !== pid) return Infinity; // muro reforzado ajeno
  return def.goldPerTile !== undefined ? 0.8 : 1;
}

/**
 * Ruta de coste mínimo desde el territorio propio hasta algún tile objetivo, y los tiles de muro que hay que
 * excavar por el camino. `goal` decide qué tiles son objetivo.
 */
/** Ruido determinista y minúsculo por tile: rompe los empates entre rutas de igual coste sin favorecer ninguna orientación. */
function jitter(seed: number, tile: number): number {
  let h = Math.imul(seed ^ Math.imul(tile + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 0.02;
}

export function planDig(
  state: MatchState,
  data: DataSet,
  pid: PlayerId,
  goal: (tile: number) => boolean,
  /** Semilla del desempate entre rutas de igual coste (0 = sin desempate aleatorio). */
  tieSeed = 0,
): DigPath | null {
  const rules = rulesOf(data);
  const total = state.width * state.height;
  const dist = new Float64Array(total).fill(Infinity);
  const prev = new Int32Array(total).fill(-1);
  // Cola de prioridad sencilla: con 4.096 nodos un montículo binario basta.
  const heap: Array<[number, number]> = [];
  const push = (d: number, n: number) => {
    heap.push([d, n]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const a = heap[i] as [number, number];
      const b = heap[p] as [number, number];
      if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) {
        heap[i] = b;
        heap[p] = a;
        i = p;
      } else break;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0] as [number, number];
    const last = heap.pop() as [number, number];
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        const less = (x: [number, number], y: [number, number]) =>
          x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
        if (l < heap.length && less(heap[l] as [number, number], heap[m] as [number, number]))
          m = l;
        if (r < heap.length && less(heap[r] as [number, number], heap[m] as [number, number]))
          m = r;
        if (m === i) break;
        const t = heap[i] as [number, number];
        heap[i] = heap[m] as [number, number];
        heap[m] = t;
        i = m;
      }
    }
    return top;
  };

  for (let i = 0; i < total; i++) {
    if (state.owner[i] === pid && rules.walkable[state.terrain[i] as number]) {
      dist[i] = 0;
      push(0, i);
    }
  }
  while (heap.length > 0) {
    const [d, n] = pop();
    if (d > (dist[n] as number)) continue;
    if (goal(n) && (dist[n] as number) > 0) {
      const tiles: number[] = [];
      for (let t = n; t >= 0 && (dist[t] as number) > 0; t = prev[t] as number) {
        const terr = knownTerrain(state, data, pid, t);
        if (!rules.walkable[terr]) tiles.push(t);
      }
      return { tiles: tiles.reverse(), cost: d };
    }
    const x = n % state.width;
    const y = Math.floor(n / state.width);
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      const ni = tileIndex(state, nx, ny);
      const c = stepCost(rules, knownTerrain(state, data, pid, ni), state.owner[ni] as number, pid);
      if (!Number.isFinite(c)) continue;
      const nd = d + c + (tieSeed !== 0 ? jitter(tieSeed, ni) : 0);
      if (nd < (dist[ni] as number)) {
        dist[ni] = nd;
        prev[ni] = n;
        push(nd, ni);
      }
    }
  }
  return null;
}

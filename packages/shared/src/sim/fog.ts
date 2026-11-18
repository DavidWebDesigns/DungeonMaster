/**
 * Niebla de guerra (sección 6.4): cada jugador ve a su alrededor y recuerda el terreno que ya vio.
 * Fuentes de visión: criaturas e Imps (6 tiles), el Corazón (8) y los tiles propios (2).
 */
import type { Rules } from './rules';
import type { MatchState, PlayerId, PlayerState } from './types';

const diskCache = new Map<number, ReadonlyArray<readonly [number, number]>>();

/** Desplazamientos (dx, dy) de los tiles a distancia ≤ radio de un tile central. */
function disk(radius: number): ReadonlyArray<readonly [number, number]> {
  const hit = diskCache.get(radius);
  if (hit) return hit;
  const out: Array<readonly [number, number]> = [];
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= radius * radius) out.push([dx, dy]);
  diskCache.set(radius, out);
  return out;
}

function mark(state: MatchState, mask: Uint8Array, cx: number, cy: number, radius: number): void {
  for (const [dx, dy] of disk(radius)) {
    const x = cx + dx;
    const y = cy + dy;
    if (x >= 0 && y >= 0 && x < state.width && y < state.height) mask[y * state.width + x] = 1;
  }
}

/** Tiles que el jugador ve ahora mismo. */
export function computeVisible(state: MatchState, rules: Rules, playerId: PlayerId): Uint8Array {
  const { vision } = rules.data.global;
  const mask = new Uint8Array(state.width * state.height);
  for (const c of state.creatures)
    if (c.owner === playerId && !c.held)
      mark(state, mask, Math.floor(c.x), Math.floor(c.y), vision.creatureRadius);
  for (const imp of state.imps)
    if (imp.owner === playerId)
      mark(state, mask, Math.floor(imp.x), Math.floor(imp.y), vision.creatureRadius);
  for (const room of state.rooms) {
    if (room.owner !== playerId || room.type !== 'heart') continue;
    // El Corazón mira desde su centro.
    let sx = 0;
    let sy = 0;
    for (const t of room.tiles) {
      sx += t % state.width;
      sy += Math.floor(t / state.width);
    }
    mark(
      state,
      mask,
      Math.round(sx / room.tiles.length),
      Math.round(sy / room.tiles.length),
      vision.heartRadius,
    );
  }
  const own = vision.ownTileRadius;
  for (let i = 0; i < state.owner.length; i++) {
    if (state.owner[i] === playerId)
      mark(state, mask, i % state.width, Math.floor(i / state.width), own);
  }
  return mask;
}

interface Cached {
  tick: number;
  mapVersion: number;
  entities: number;
  masks: Map<PlayerId, Uint8Array>;
}
const cache = new WeakMap<MatchState, Cached>();

/** Máscara de visión con caché por tick (se recalcula si cambió el mapa o el número de entidades). */
export function visibleMask(state: MatchState, rules: Rules, playerId: PlayerId): Uint8Array {
  const entities = state.creatures.length * 1000 + state.imps.length;
  let c = cache.get(state);
  if (!c || c.tick !== state.tick || c.mapVersion !== state.mapVersion || c.entities !== entities) {
    c = { tick: state.tick, mapVersion: state.mapVersion, entities, masks: new Map() };
    cache.set(state, c);
  }
  let m = c.masks.get(playerId);
  if (!m) {
    m = computeVisible(state, rules, playerId);
    c.masks.set(playerId, m);
  }
  return m;
}

export function isVisible(
  state: MatchState,
  rules: Rules,
  playerId: PlayerId,
  tile: number,
): boolean {
  return visibleMask(state, rules, playerId)[tile] === 1;
}

/** ¿Ve el jugador la posición (en tiles, con decimales)? */
export function canSee(
  state: MatchState,
  rules: Rules,
  playerId: PlayerId,
  x: number,
  y: number,
): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) return false;
  return visibleMask(state, rules, playerId)[ty * state.width + tx] === 1;
}

/** Paso 11 del tick: lo que se ve ahora pasa a ser terreno recordado. */
export function updateSeen(state: MatchState, rules: Rules): void {
  for (const p of state.players) {
    if (p.eliminated) continue;
    const mask = visibleMask(state, rules, p.id);
    markSeen(p, mask);
  }
}

function markSeen(p: PlayerState, mask: Uint8Array): void {
  for (let i = 0; i < mask.length; i++) if (mask[i] === 1) p.seen[i] = 1;
}

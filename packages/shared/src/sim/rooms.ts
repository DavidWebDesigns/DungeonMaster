import { treasuryCapacity } from './economy';
import { neighbors4 } from './grid';
import type { Rules } from './rules';
import type { MatchState, PlayerState, Room, SimEvent } from './types';

/** Ids de las salas de `required` que el jugador todavía no tiene construidas (en el orden pedido, sin repetir). */
export function missingRooms(
  state: MatchState,
  owner: number,
  required: readonly string[] | undefined,
): string[] {
  if (!required) return [];
  const missing: string[] = [];
  for (const id of required)
    if (!missing.includes(id) && !state.rooms.some((r) => r.owner === owner && r.type === id))
      missing.push(id);
  return missing;
}

export function getRoom(state: MatchState, id: number): Room | undefined {
  return state.rooms.find((r) => r.id === id);
}

/** Si la Tesorería encoge, el oro que ya no cabe se pierde. */
export function clampGold(state: MatchState, rules: Rules, player: PlayerState): void {
  player.gold = Math.min(player.gold, treasuryCapacity(state, rules, player.id));
}

/** Tiles máximos de una sala de ese tipo (el nivel máximo). Sin tope (Corazón, Portal) es infinito. */
export function roomMaxTiles(rules: Rules, type: string): number {
  return rules.roomDefs[type]?.maxTiles ?? Infinity;
}

/** Nivel de una sala = número de tiles conectados que tiene (de 1 hasta el máximo de su tipo). */
export const roomLevel = (room: Pick<Room, 'tiles'>): number => room.tiles.length;

/** Mayor nivel que tiene el jugador entre sus salas de un tipo (0 si no tiene ninguna). */
export function maxRoomLevel(state: MatchState, owner: number, type: string): number {
  let best = 0;
  for (const r of state.rooms)
    if (r.owner === owner && r.type === type) best = Math.max(best, r.tiles.length);
  return best;
}

/** Hace crecer `tiles` con el tile del `pool` de menor índice que toque a la sala, hasta `max`. Conserva la conexión. */
function growInto(state: MatchState, tiles: number[], pool: Set<number>, max: number): boolean {
  let grew = false;
  while (tiles.length < max) {
    let best = -1;
    for (const t of tiles)
      for (const n of neighbors4(state, t)) if (pool.has(n) && (best < 0 || n < best)) best = n;
    if (best < 0) break;
    tiles.push(best);
    pool.delete(best);
    grew = true;
  }
  return grew;
}

/** Componentes conexos (4 vecinos) de un conjunto de tiles, cada uno ordenado, por orden de su tile menor. */
function components(state: MatchState, tiles: readonly number[]): number[][] {
  const left = new Set(tiles);
  const out: number[][] = [];
  for (const seed of [...tiles].sort((a, b) => a - b)) {
    if (!left.has(seed)) continue;
    const comp = [seed];
    left.delete(seed);
    for (let k = 0; k < comp.length; k++)
      for (const n of neighbors4(state, comp[k] as number))
        if (left.has(n)) {
          left.delete(n);
          comp.push(n);
        }
    out.push(comp.sort((a, b) => a - b));
  }
  return out;
}

/**
 * Quita un tile de su sala. Si la sala se queda sin tiles desaparece, y si se queda en varios trozos desconectados
 * se parte en una sala por trozo: el mayor conserva el id (el de tile menor en caso de empate) y los demás reciben
 * ids nuevos. No toca el terreno ni vuelve a unir salas.
 */
export function removeRoomTile(state: MatchState, rules: Rules, tile: number): void {
  const id = state.roomAt[tile] as number;
  if (!id) return;
  const room = getRoom(state, id);
  state.roomAt[tile] = 0;
  if (!room) return;
  const rest = room.tiles.filter((t) => t !== tile);
  if (rest.length === 0) {
    state.rooms = state.rooms.filter((r) => r.id !== id);
  } else {
    const parts = components(state, rest);
    // El mayor trozo conserva la sala; a igualdad, el que tiene el tile menor (los trozos ya salen ordenados así).
    let keep = 0;
    parts.forEach((p, i) => {
      if (p.length > (parts[keep] as number[]).length) keep = i;
    });
    room.tiles = parts[keep] as number[];
    parts.forEach((p, i) => {
      if (i === keep) return;
      const piece: Room = {
        id: state.nextRoomId++,
        type: room.type,
        owner: room.owner,
        tiles: p,
        timer: 0,
        stock: 0,
      };
      for (const t of p) state.roomAt[t] = piece.id;
      state.rooms.push(piece);
    });
  }
  const owner = state.players.find((p) => p.id === room.owner);
  if (owner) clampGold(state, rules, owner);
}

/** Una sala resultante de construir: una existente que se amplía (`roomId`) o una nueva (`null`), con todos sus tiles. */
export interface RoomPiece {
  roomId: number | null;
  /** Tiles finales de la sala, ordenados. El nivel es `tiles.length`. */
  tiles: number[];
}

/**
 * Cómo se repartirá un rectángulo al construirlo (sin tocar el estado): primero se rellenan las salas vecinas del
 * mismo tipo y dueño que no estén llenas (por orden de id) y lo que sobra forma salas nuevas de hasta `maxTiles`
 * tiles, empezando por el tile de menor índice. Solo depende de los índices de tile y de los ids, así que es
 * determinista. La simulación (`buildRoomNow`) y la vista previa del cliente usan esta misma función.
 */
export function planRoomBuild(
  state: MatchState,
  rules: Rules,
  owner: number,
  type: string,
  rect: { x: number; y: number; w: number; h: number },
): RoomPiece[] {
  const max = roomMaxTiles(rules, type);
  const pool = new Set<number>();
  for (let y = rect.y; y < rect.y + rect.h; y++)
    for (let x = rect.x; x < rect.x + rect.w; x++) pool.add(y * state.width + x);
  const grown = new Map<number, number[]>();
  // 1. Rellenar las salas vecinas del mismo tipo (hasta que ninguna crezca más).
  let changed = true;
  while (changed && pool.size > 0) {
    changed = false;
    for (const room of state.rooms) {
      if (room.owner !== owner || room.type !== type) continue;
      const tiles = grown.get(room.id) ?? [...room.tiles];
      if (tiles.length >= max) continue;
      if (growInto(state, tiles, pool, max)) {
        changed = true;
        grown.set(room.id, tiles);
      }
    }
  }
  const out: RoomPiece[] = [...grown].map(([roomId, tiles]) => ({
    roomId,
    tiles: tiles.sort((a, b) => a - b),
  }));
  // 2. Lo que sobra: salas nuevas de hasta `max` tiles conectados.
  while (pool.size > 0) {
    const seed = Math.min(...pool);
    pool.delete(seed);
    const tiles = [seed];
    growInto(state, tiles, pool, max);
    out.push({ roomId: null, tiles: tiles.sort((a, b) => a - b) });
  }
  return out;
}

/**
 * Precio del tile número `n` (desde 1) de una sala de ese tipo: `goldPerTile × factor^(n-1)`, redondeado por tile para
 * que el oro siga siendo entero. La potencia se arma multiplicando (no con `Math.pow`) para que servidor y navegador
 * den exactamente lo mismo.
 */
export function roomTileCost(rules: Rules, type: string, n: number): number {
  const def = rules.roomDefs[type];
  if (!def || n < 1) return 0;
  const growth = rules.data.economy.roomCostGrowthPerTile;
  let factor = 1;
  for (let i = 1; i < n; i++) factor *= growth;
  return Math.round(def.goldPerTile * factor);
}

/** Coste de pasar una sala de `from` tiles a `to` tiles (los tiles `from+1 ... to`). */
export function roomCostRange(rules: Rules, type: string, from: number, to: number): number {
  let sum = 0;
  for (let n = from + 1; n <= to; n++) sum += roomTileCost(rules, type, n);
  return sum;
}

/** Coste total de un reparto (`planRoomBuild`): cada sala resultante paga desde su tamaño actual hasta el final. */
export function planCost(
  state: MatchState,
  rules: Rules,
  type: string,
  pieces: RoomPiece[],
): number {
  let sum = 0;
  for (const p of pieces) {
    const before = p.roomId === null ? 0 : (getRoom(state, p.roomId)?.tiles.length ?? 0);
    sum += roomCostRange(rules, type, before, p.tiles.length);
  }
  return sum;
}

/** Lo que costaría construir este rectángulo ahora mismo (la misma cuenta que usa la simulación al cobrar). */
export function roomBuildCost(
  state: MatchState,
  rules: Rules,
  owner: number,
  type: string,
  rect: { x: number; y: number; w: number; h: number },
): number {
  return planCost(state, rules, type, planRoomBuild(state, rules, owner, type, rect));
}

/** Lo que vale una sala hoy (para la devolución al venderla): sus tiles pagados con el precio incremental. */
export function roomValue(rules: Rules, room: Pick<Room, 'type' | 'tiles'>): number {
  return roomCostRange(rules, room.type, 0, room.tiles.length);
}

/**
 * Construye una sala ya validada y cobra su coste (por tile, creciente dentro de cada sala). Las salas tienen como máximo `maxTiles` tiles conectados
 * (ver `planRoomBuild` para cómo se reparte el rectángulo).
 */
export function buildRoomNow(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  type: string,
  rect: { x: number; y: number; w: number; h: number },
  events: SimEvent[],
): void {
  const def = rules.roomDefs[type];
  if (!def) return;
  const plan = planRoomBuild(state, rules, player.id, type, rect);
  player.gold -= planCost(state, rules, type, plan);
  const touched: number[] = [];
  for (const piece of plan) {
    let room = piece.roomId === null ? undefined : getRoom(state, piece.roomId);
    if (!room) {
      room = { id: state.nextRoomId++, type, owner: player.id, tiles: [], timer: 0, stock: 0 };
      state.rooms.push(room);
    }
    room.tiles = piece.tiles;
    for (const t of room.tiles) state.roomAt[t] = room.id;
    touched.push(room.id);
  }
  state.mapVersion++;
  for (const roomId of touched) events.push({ type: 'roomBuilt', playerId: player.id, roomId });
}

/** Vende una sala entera ya validada y devuelve su parte del coste. */
export function sellRoomNow(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  room: Room,
  events: SimEvent[],
): void {
  const def = rules.roomDefs[room.type];
  if (!def) return;
  const refund = Math.floor(roomValue(rules, room) * def.sellRefund);
  for (const t of room.tiles) state.roomAt[t] = 0;
  state.rooms = state.rooms.filter((r) => r.id !== room.id);
  player.gold += refund;
  clampGold(state, rules, player);
  state.mapVersion++;
  events.push({ type: 'roomSold', playerId: player.id, roomId: room.id });
}

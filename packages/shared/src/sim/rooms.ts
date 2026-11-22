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
        piglets: 0,
        pigletTimer: 0,
      };
      for (const t of p) state.roomAt[t] = piece.id;
      state.rooms.push(piece);
    });
  }
  const owner = state.players.find((p) => p.id === room.owner);
  if (owner) clampGold(state, rules, owner);
}

/**
 * Una sala resultante de construir. `roomId` es la sala existente que sobrevive (la de menor id si se unen varias) o
 * `null` si es nueva; `absorbs` son las otras salas existentes que se unen a ella y desaparecen. Solo salen las salas que
 * reciben tiles nuevos.
 */
export interface RoomPiece {
  roomId: number | null;
  /** Ids de las demás salas existentes que se fusionan en esta. */
  absorbs: number[];
  /** Tiles finales de la sala, ordenados. El nivel es `tiles.length`. */
  tiles: number[];
  /** Los tiles que se colocan ahora en esta sala. */
  newTiles: number[];
  /** Oro que cuestan esos tiles nuevos (cada uno, al precio de su número dentro de la sala ya unida). */
  cost: number;
}

/**
 * Cómo se repartirá un rectángulo al construirlo (sin tocar el estado). Los tiles se colocan de uno en uno, siempre el de
 * menor índice entre los que tocan alguna sala (o, si ninguno toca, el de menor índice):
 *
 * - Si toca una o varias salas del mismo tipo y dueño que aún no están llenas (menos de `maxTiles`), **se unen todas en
 *   una** junto con el tile, y el tile se paga al precio de su número dentro de la sala resultante (el total de tiles
 *   conectados). Así, un tile que une dos salas de 4 y 3 cuesta como el tile n.º 8.
 * - Si el total de tiles conectados pasaría de `maxTiles`, el tile abre una **sala nueva de nivel 1** (que puede quedar
 *   pegada a otras). Las salas ya llenas no cuentan: no admiten más tiles.
 * - Si no toca ninguna, abre una sala nueva.
 *
 * Solo depende de los índices de tile y de los ids, así que es determinista. La simulación (`buildRoomNow`) y la
 * vista previa del cliente usan esta misma función.
 */
export function planRoomBuild(
  state: MatchState,
  rules: Rules,
  owner: number,
  type: string,
  rect: { x: number; y: number; w: number; h: number },
): RoomPiece[] {
  const max = roomMaxTiles(rules, type);
  interface Group {
    roomId: number | null;
    absorbs: Set<number>;
    tiles: number[];
    newTiles: number[];
    cost: number;
  }
  // Las claves positivas son ids de sala existentes; las negativas, salas nuevas de este reparto.
  const groups = new Map<number, Group>();
  const groupAt = new Map<number, number>();
  for (const room of state.rooms) {
    if (room.owner !== owner || room.type !== type) continue;
    groups.set(room.id, {
      roomId: room.id,
      absorbs: new Set(),
      tiles: [...room.tiles],
      newTiles: [],
      cost: 0,
    });
    for (const t of room.tiles) groupAt.set(t, room.id);
  }
  const pool = new Set<number>();
  for (let y = rect.y; y < rect.y + rect.h; y++)
    for (let x = rect.x; x < rect.x + rect.w; x++) pool.add(y * state.width + x);
  const keysAround = (tile: number): number[] => {
    const keys = new Set<number>();
    for (const n of neighbors4(state, tile)) {
      const k = groupAt.get(n);
      if (k !== undefined) keys.add(k);
    }
    return [...keys];
  };
  let nextKey = -1;
  while (pool.size > 0) {
    let pick = -1;
    for (const t of pool) if ((pick < 0 || t < pick) && keysAround(t).length > 0) pick = t;
    if (pick < 0) for (const t of pool) if (pick < 0 || t < pick) pick = t;
    pool.delete(pick);
    const open = keysAround(pick).filter((k) => (groups.get(k) as Group).tiles.length < max);
    const total = 1 + open.reduce((n, k) => n + (groups.get(k) as Group).tiles.length, 0);
    if (open.length === 0 || total > max) {
      const key = nextKey--;
      groups.set(key, {
        roomId: null,
        absorbs: new Set(),
        tiles: [pick],
        newTiles: [pick],
        cost: roomTileCost(rules, type, 1),
      });
      groupAt.set(pick, key);
      continue;
    }
    // Sobrevive la sala existente de menor id; si todas son nuevas, la más antigua del reparto.
    const existing = open.filter((k) => k > 0).sort((a, b) => a - b);
    const survivorKey = existing.length > 0 ? (existing[0] as number) : Math.max(...open);
    const survivor = groups.get(survivorKey) as Group;
    for (const k of open) {
      if (k === survivorKey) continue;
      const g = groups.get(k) as Group;
      survivor.tiles.push(...g.tiles);
      survivor.newTiles.push(...g.newTiles);
      survivor.cost += g.cost;
      if (g.roomId !== null) survivor.absorbs.add(g.roomId);
      for (const id of g.absorbs) survivor.absorbs.add(id);
      for (const t of g.tiles) groupAt.set(t, survivorKey);
      groups.delete(k);
    }
    survivor.cost += roomTileCost(rules, type, total);
    survivor.tiles.push(pick);
    survivor.newTiles.push(pick);
    groupAt.set(pick, survivorKey);
  }
  const out: RoomPiece[] = [];
  const keys = [...groups.keys()].sort((a, b) => (a > 0 && b > 0 ? a - b : b - a));
  for (const k of keys) {
    const g = groups.get(k) as Group;
    if (g.newTiles.length === 0) continue;
    out.push({
      roomId: g.roomId,
      absorbs: [...g.absorbs].sort((a, b) => a - b),
      tiles: g.tiles.sort((a, b) => a - b),
      newTiles: g.newTiles.sort((a, b) => a - b),
      cost: g.cost,
    });
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

/** Coste total de un reparto (`planRoomBuild`): la suma de lo que cuesta cada tile nuevo en su sala. */
export function planCost(pieces: readonly RoomPiece[]): number {
  return pieces.reduce((sum, p) => sum + p.cost, 0);
}

/** Lo que costaría construir este rectángulo ahora mismo (la misma cuenta que usa la simulación al cobrar). */
export function roomBuildCost(
  state: MatchState,
  rules: Rules,
  owner: number,
  type: string,
  rect: { x: number; y: number; w: number; h: number },
): number {
  return planCost(planRoomBuild(state, rules, owner, type, rect));
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
  player.gold -= planCost(plan);
  const touched: number[] = [];
  for (const piece of plan) {
    let room = piece.roomId === null ? undefined : getRoom(state, piece.roomId);
    if (!room) {
      room = {
        id: state.nextRoomId++,
        type,
        owner: player.id,
        tiles: [],
        timer: 0,
        stock: 0,
        piglets: 0,
        pigletTimer: 0,
      };
      state.rooms.push(room);
    }
    // Las salas que se unen desaparecen: sus pollos, cerditos y quien las usaba pasan a la que sobrevive.
    for (const id of piece.absorbs) {
      const gone = getRoom(state, id);
      if (!gone) continue;
      room.stock += gone.stock;
      room.piglets += gone.piglets;
      for (const c of state.creatures) if (c.targetRoom === id) c.targetRoom = room.id;
    }
    if (piece.absorbs.length > 0)
      state.rooms = state.rooms.filter((r) => !piece.absorbs.includes(r.id));
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

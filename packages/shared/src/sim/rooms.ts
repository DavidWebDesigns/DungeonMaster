import { treasuryCapacity } from './economy';
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

/** Quita un tile de su sala; la sala desaparece si se queda sin tiles. No toca el terreno. */
export function removeRoomTile(state: MatchState, rules: Rules, tile: number): void {
  const id = state.roomAt[tile] as number;
  if (!id) return;
  const room = getRoom(state, id);
  state.roomAt[tile] = 0;
  if (!room) return;
  room.tiles = room.tiles.filter((t) => t !== tile);
  if (room.tiles.length === 0) state.rooms = state.rooms.filter((r) => r.id !== id);
  const owner = state.players.find((p) => p.id === room.owner);
  if (owner) clampGold(state, rules, owner);
}

/** Construye una sala ya validada y cobra su coste. */
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
  const room: Room = {
    id: state.nextRoomId++,
    type,
    owner: player.id,
    tiles: [],
    timer: 0,
    stock: 0,
  };
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = y * state.width + x;
      room.tiles.push(i);
      state.roomAt[i] = room.id;
    }
  }
  player.gold -= def.goldPerTile * room.tiles.length;
  state.rooms.push(room);
  state.mapVersion++;
  events.push({ type: 'roomBuilt', playerId: player.id, roomId: room.id });
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
  const refund = Math.floor(def.goldPerTile * room.tiles.length * def.sellRefund);
  for (const t of room.tiles) state.roomAt[t] = 0;
  state.rooms = state.rooms.filter((r) => r.id !== room.id);
  player.gold += refund;
  clampGold(state, rules, player);
  state.mapVersion++;
  events.push({ type: 'roomSold', playerId: player.id, roomId: room.id });
}

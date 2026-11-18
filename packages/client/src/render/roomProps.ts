import { treasuryCapacity, rulesOf, type DataSet, type MatchState, type Room } from '@dm/shared';

/** Cuánto está llena la Tesorería del dueño (0 a 1); los montones de oro suben con esto. */
export function treasuryFill(state: MatchState, data: DataSet, room: Room): number {
  const player = state.players.find((p) => p.id === room.owner);
  if (!player) return 0;
  const cap = treasuryCapacity(state, rulesOf(data), room.owner);
  return cap > 0 ? Math.min(1, player.gold / cap) : 0;
}

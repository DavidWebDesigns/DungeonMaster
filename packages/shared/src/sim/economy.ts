import type { Rules } from './rules';
import type { MatchState, PlayerId, PlayerState } from './types';

export function getPlayer(state: MatchState, id: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === id);
}

/** Oro que caben las Tesorerías de un jugador (1.000 por tile en el MVP). */
export function treasuryCapacity(state: MatchState, rules: Rules, playerId: PlayerId): number {
  let cap = 0;
  for (const room of state.rooms) {
    if (room.owner !== playerId) continue;
    cap += (rules.roomDefs[room.type]?.goldCapacityPerTile ?? 0) * room.tiles.length;
  }
  return cap;
}

/** Oro que llevan ahora los Imps del jugador. */
export function carriedGold(state: MatchState, playerId: PlayerId): number {
  let sum = 0;
  for (const imp of state.imps) if (imp.owner === playerId) sum += imp.carry;
  return sum;
}

/** Hueco libre en la Tesorería, contando lo que los Imps ya llevan encima. Si es 0, no se mina. */
export function goldRoom(state: MatchState, rules: Rules, player: PlayerState): number {
  return Math.max(
    0,
    treasuryCapacity(state, rules, player.id) - player.gold - carriedGold(state, player.id),
  );
}

export function impCount(state: MatchState, playerId: PlayerId): number {
  let n = 0;
  for (const imp of state.imps) if (imp.owner === playerId) n++;
  return n;
}

/** Tiles reclamados por el jugador (suelo propio caminable). */
export function claimedTileCount(state: MatchState, rules: Rules, playerId: PlayerId): number {
  let n = 0;
  for (let i = 0; i < state.owner.length; i++) {
    if (state.owner[i] === playerId && rules.walkable[state.terrain[i] as number]) n++;
  }
  return n;
}

/** Regeneración de maná por segundo: base + bonus por tile reclamado, con tope. */
export function manaRegenPerSecond(state: MatchState, rules: Rules, playerId: PlayerId): number {
  const m = rules.data.global.mana;
  return Math.min(
    m.regenBasePerSecond +
      m.regenPerClaimedTilePerSecond * claimedTileCount(state, rules, playerId),
    m.regenCapPerSecond,
  );
}

/** Coste de Crear Imp: base + extra por cada Imp por encima de los iniciales. */
export function createImpCost(state: MatchState, rules: Rules, playerId: PlayerId): number {
  const spell = rules.spells['createImp'];
  if (!spell) throw new Error('spells.json no define createImp');
  const extra = Math.max(0, impCount(state, playerId) - rules.data.global.imps.start);
  return spell.mana + (spell.manaPerExtraImp ?? 0) * extra;
}

/** Paso 2 del tick: maná. */
export function tickEconomy(state: MatchState, rules: Rules): void {
  for (const p of state.players) {
    if (p.eliminated) continue;
    const regen = manaRegenPerSecond(state, rules, p.id) * rules.dt;
    p.mana = Math.min(rules.data.global.mana.max, p.mana + regen);
  }
}

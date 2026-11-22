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

/** Maná por segundo que dan los tiles de Templo del jugador (`manaPerTilePerSecond` por tile). */
export function templeManaPerSecond(state: MatchState, rules: Rules, playerId: PlayerId): number {
  const perTile = rules.roomDefs['temple']?.manaPerTilePerSecond ?? 0;
  let tiles = 0;
  for (const r of state.rooms)
    if (r.owner === playerId && r.type === 'temple') tiles += r.tiles.length;
  return perTile * tiles;
}

/**
 * Regeneración de maná por segundo: base + bonus por tile reclamado, con tope; y encima, sin tope, lo que dan los tiles
 * de Templo.
 */
export function manaRegenPerSecond(state: MatchState, rules: Rules, playerId: PlayerId): number {
  const m = rules.data.global.mana;
  return (
    Math.min(
      m.regenBasePerSecond +
        m.regenPerClaimedTilePerSecond * claimedTileCount(state, rules, playerId),
      m.regenCapPerSecond,
    ) + templeManaPerSecond(state, rules, playerId)
  );
}

/** Las Bibliotecas que dan pulsos de maná ahora mismo (nivel suficiente) de un jugador. */
function pulsingLibraries(state: MatchState, rules: Rules, playerId: PlayerId) {
  const def = rules.roomDefs['library'];
  if (!def?.manaPulseMinLevel) return [];
  return state.rooms.filter(
    (r) =>
      r.owner === playerId &&
      r.type === 'library' &&
      r.tiles.length >= (def.manaPulseMinLevel ?? 1),
  );
}

/** Maná por segundo que dan, de media, los pulsos de las Bibliotecas de nivel alto (para mostrarlo en el HUD). */
export function manaPulsePerSecond(state: MatchState, rules: Rules, playerId: PlayerId): number {
  const def = rules.roomDefs['library'];
  if (!def?.manaPulseAmount || !def.manaPulseSeconds) return 0;
  return (
    (pulsingLibraries(state, rules, playerId).length * def.manaPulseAmount) / def.manaPulseSeconds
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
  tickLibraryPulses(state, rules);
}

/**
 * Bibliotecas de nivel alto: cada `manaPulseSeconds` dan `manaPulseAmount` de maná a su dueño. El reloj (`room.timer`)
 * solo corre mientras la sala tiene el nivel; si lo pierde, empieza de cero.
 */
function tickLibraryPulses(state: MatchState, rules: Rules): void {
  const def = rules.roomDefs['library'];
  if (!def?.manaPulseMinLevel || !def.manaPulseAmount || !def.manaPulseSeconds) return;
  const interval = Math.round(def.manaPulseSeconds * rules.data.global.tickRate);
  for (const room of state.rooms) {
    if (room.type !== 'library') continue;
    const owner = state.players.find((p) => p.id === room.owner);
    if (!owner || owner.eliminated || room.tiles.length < def.manaPulseMinLevel) {
      room.timer = 0;
      continue;
    }
    room.timer++;
    if (room.timer < interval) continue;
    room.timer = 0;
    owner.mana = Math.min(rules.data.global.mana.max, owner.mana + def.manaPulseAmount);
  }
}

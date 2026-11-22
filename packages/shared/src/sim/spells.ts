import { areaDamage, isHasted } from './combat';
import { creatureMaxHp } from './creatureStats';
import type { Rules } from './rules';
import type { MatchState, PlayerState, SimEvent } from './types';

/** Efectos de hechizo ya validados (Acelerar, Curar, Rayo y Llamada a las armas). */
export function castEffect(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  spellId: string,
  tile: number,
  creatureId: number | undefined,
  events: SimEvent[],
): void {
  const spell = rules.spells[spellId];
  if (!spell) return;
  const rate = rules.data.global.tickRate;
  const x = (tile % state.width) + 0.5;
  const y = Math.floor(tile / state.width) + 0.5;
  const e = spell.effect;
  switch (e.type) {
    case 'rallyPoint':
      player.rallyTile = tile;
      player.rallyUntil = state.tick + Math.round(e.durationSeconds * rate);
      break;
    case 'haste': {
      const c = state.creatures.find((k) => k.id === creatureId);
      if (c) c.hasteUntil = state.tick + Math.round(e.durationSeconds * rate);
      break;
    }
    case 'heal': {
      const c = state.creatures.find((k) => k.id === creatureId);
      if (c) {
        const ticks = Math.max(1, Math.round(e.overSeconds * rate));
        c.healTicksLeft = ticks;
        c.healPerTick = (creatureMaxHp(rules, c) * e.maxHpFraction) / ticks;
      }
      break;
    }
    case 'areaDamage':
      areaDamage(state, rules, player.id, x, y, e.radius, e.damage, events);
      break;
    default:
      break;
  }
  const c = creatureId !== undefined ? state.creatures.find((k) => k.id === creatureId) : undefined;
  events.push({
    type: 'spellCast',
    playerId: player.id,
    spell: spellId,
    x: c?.x ?? x,
    y: c?.y ?? y,
  });
}

/** Paso 8 del tick: curaciones en marcha y caducidad de la Llamada a las armas. */
export function tickSpells(state: MatchState, rules: Rules): void {
  for (const c of state.creatures) {
    if (c.healTicksLeft > 0 && c.downedUntil === 0) {
      c.hp = Math.min(creatureMaxHp(rules, c), c.hp + c.healPerTick);
      c.healTicksLeft--;
    }
  }
  for (const p of state.players) {
    if (p.rallyTile >= 0 && state.tick >= p.rallyUntil) p.rallyTile = -1;
  }
  void isHasted;
}

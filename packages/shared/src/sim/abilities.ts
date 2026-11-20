/**
 * Habilidades de las criaturas (ASSETS.md §3) y sus estados temporales. Todo sale de abilities.json: el código solo
 * interpreta los efectos. Las pasivas modifican el daño, el movimiento y las reglas; las activas las lanza la criatura
 * sola en combate (ver `updateAbilities`, más abajo).
 */
import type { AbilityDef, AbilityEffect, ImmunityKind, StatusKind } from '../schemas';
import { creatureMaxHp } from './creatureStats';
import type { Rules } from './rules';
import type { Creature, Imp, MatchState, Status } from './types';

type EffectOf<T extends AbilityEffect['type']> = Extract<AbilityEffect, { type: T }>;

/** Habilidades que la criatura ya tiene desbloqueadas por su nivel. */
export function unlockedAbilities(rules: Rules, c: Pick<Creature, 'type' | 'level'>): AbilityDef[] {
  return (rules.abilitiesOf[c.type] ?? []).filter((a) => c.level >= a.unlockLevel);
}

/** La habilidad pasiva de un tipo de efecto, si la criatura la tiene desbloqueada. */
export function passive<T extends AbilityEffect['type']>(
  rules: Rules,
  c: Pick<Creature, 'type' | 'level'>,
  type: T,
): { ability: AbilityDef; effect: EffectOf<T> } | undefined {
  for (const a of unlockedAbilities(rules, c))
    if (a.kind === 'passive' && a.effect.type === type)
      return { ability: a, effect: a.effect as EffectOf<T> };
  return undefined;
}

/** El estado activo de un tipo, si lo tiene ahora. */
export function statusOf(state: MatchState, c: Creature, kind: StatusKind): Status | undefined {
  return c.statuses.find((s) => s.kind === kind && s.until > state.tick);
}

/** ¿Es inmune a esto (por No muerto, Hija de la lava...)? */
export function isImmune(
  rules: Rules,
  c: Pick<Creature, 'type' | 'level'>,
  to: ImmunityKind,
): boolean {
  if (passive(rules, c, 'immunity')?.effect.to.includes(to)) return true;
  return passive(rules, c, 'crossTerrain')?.effect.immuneTo?.includes(to) ?? false;
}

/**
 * Deja un estado en la criatura durante `seconds`. Si ya tenía uno del mismo tipo, se queda el que dura más
 * (sin acumular intensidad). La lista se mantiene ordenada por tipo para que el estado sea determinista.
 */
export function applyStatus(
  state: MatchState,
  rules: Rules,
  c: Creature,
  kind: StatusKind,
  value: number,
  seconds: number,
): void {
  const until = state.tick + Math.round(seconds * rules.data.global.tickRate);
  const current = c.statuses.find((s) => s.kind === kind);
  if (current) {
    if (current.until >= until && current.until > state.tick) return;
    current.until = until;
    current.value = value;
    return;
  }
  c.statuses.push({ kind, until, value });
  c.statuses.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

/** Factor de velocidad por estados: 0 si está atada o aturdida; ralentizar lo reduce. */
export function statusSpeedFactor(state: MatchState, c: Creature): number {
  if (statusOf(state, c, 'stun') || statusOf(state, c, 'root')) return 0;
  const slow = statusOf(state, c, 'slow');
  return slow ? Math.max(0, 1 + slow.value) : 1;
}

export const isStunned = (state: MatchState, c: Creature): boolean => !!statusOf(state, c, 'stun');

/** Vida máxima de cualquier unidad (criatura o Imp). */
function maxHpOf(rules: Rules, u: Creature | Imp): number {
  return 'level' in u ? creatureMaxHp(rules, u) : rules.imp.base.hp;
}

/**
 * Daño final de un golpe a partir del daño base: Debilitar del atacante, Intimidar de un enemigo cerca, Ejecución
 * contra objetivos con poca vida y Guardia de quien lo recibe. Todo se multiplica y nada usa el azar.
 */
export function adjustDamage(
  state: MatchState,
  rules: Rules,
  attacker: Creature,
  victim: Creature | Imp,
  base: number,
): number {
  let dmg = base;
  const weaken = statusOf(state, attacker, 'weaken');
  if (weaken) dmg *= 1 + weaken.value;

  // Intimidar: el enemigo más temible de los que están cerca decide cuánto se recorta (no se acumula).
  let aura = 0;
  for (const e of state.creatures) {
    if (e.owner === attacker.owner || e.held || e.hp <= 0) continue;
    const p = passive(rules, e, 'auraDamageMod');
    if (!p || attacker.level > p.effect.maxEnemyLevel) continue;
    const radius = p.ability.radiusTiles ?? 0;
    if (Math.hypot(e.x - attacker.x, e.y - attacker.y) <= radius)
      aura = Math.min(aura, p.effect.damageMod);
  }
  dmg *= 1 + aura;

  const exec = passive(rules, attacker, 'executeBonus');
  if (exec && victim.hp / maxHpOf(rules, victim) < exec.effect.belowHpFraction)
    dmg *= 1 + exec.effect.damageBonus;

  if ('level' in victim) {
    const guard = passive(rules, victim, 'stillGuard');
    const needed = guard ? guard.effect.stillSeconds * rules.data.global.tickRate : Infinity;
    if (guard && victim.stillTicks >= needed) dmg *= 1 + guard.effect.damageTakenMod;
  }
  return dmg;
}

/** Drenar: el atacante se cura una fracción del daño que ha hecho. */
export function applyLifesteal(rules: Rules, attacker: Creature, dealt: number): void {
  const p = passive(rules, attacker, 'lifesteal');
  if (p)
    attacker.hp = Math.min(creatureMaxHp(rules, attacker), attacker.hp + dealt * p.effect.fraction);
}

/**
 * ¿Puede la criatura estar de pie en este tile? Los terrenos caminables, y además los que su habilidad de cruzar
 * terreno permite (el Ángel caído sobre agua y lava, la Salamandra sobre lava).
 */
export function canStandOn(
  state: MatchState,
  rules: Rules,
  c: Pick<Creature, 'type' | 'level'>,
  tile: number,
): boolean {
  const t = state.terrain[tile] as number;
  if (rules.walkable[t]) return true;
  const cross = passive(rules, c, 'crossTerrain');
  return cross ? cross.effect.terrains.some((id) => rules.terrainIndex[id] === t) : false;
}

/** Cada tick: caducan los estados y se cuentan los ticks seguidos sin moverse (Guardia). */
export function tickAbilityState(state: MatchState): void {
  for (const c of state.creatures) {
    if (c.statuses.length > 0 && c.statuses.some((s) => s.until <= state.tick))
      c.statuses = c.statuses.filter((s) => s.until > state.tick);
    c.stillTicks = c.mode === 'moving' ? 0 : c.stillTicks + 1;
  }
}

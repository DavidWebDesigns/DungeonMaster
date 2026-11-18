import type { Rules } from './rules';
import type { Creature, MatchState } from './types';

type Band = Rules['bands'][number];

/** Multiplicador de nivel: 1 + 0,35 × (nivel − 1). */
export function levelMultiplier(rules: Rules, level: number): number {
  return 1 + rules.data.progression.levelMultiplierStep * (level - 1);
}

/** valor(n) = floor(base × mult(n)). Solo escalan los valores que dice progression.scalesWithLevel. */
export function scaledStat(
  rules: Rules,
  stat: 'hp' | 'damage' | 'wage',
  base: number,
  level: number,
): number {
  if (!rules.data.progression.scalesWithLevel.includes(stat)) return base;
  // La tolerancia evita que un error de coma flotante (1500 × 2,05 = 3074,9999…) reste un punto.
  return Math.floor(base * levelMultiplier(rules, level) + 1e-9);
}

export function creatureMaxHp(rules: Rules, c: Pick<Creature, 'type' | 'level'>): number {
  const def = rules.creatureDefs[c.type];
  return def ? scaledStat(rules, 'hp', def.base.hp, c.level) : 0;
}

export function creatureWage(rules: Rules, c: Pick<Creature, 'type' | 'level'>): number {
  const def = rules.creatureDefs[c.type];
  return def ? scaledStat(rules, 'wage', def.base.wage, c.level) : 0;
}

/** Banda de ánimo para un valor de 0 a 100. */
export function moodBandOf(rules: Rules, mood: number): Band {
  const hit = rules.bands.find((b) => mood >= b.min);
  return hit ?? (rules.bands[rules.bands.length - 1] as Band);
}

/** Velocidad de trabajo: banda de ánimo y empujón de la bofetada. 0 si está Furiosa (detenida). */
export function workSpeedFactor(state: MatchState, rules: Rules, c: Creature): number {
  const band = moodBandOf(rules, c.mood);
  if (band.workSpeedMod === null) return 0;
  const slap = state.tick < c.slapUntil ? 1 + rules.data.global.slap.workSpeedBonus : 1;
  return (1 + band.workSpeedMod) * slap;
}

/** Multiplicador de la experiencia ganada según el ánimo. */
export function xpFactor(rules: Rules, c: Creature): number {
  return Math.max(0, 1 + moodBandOf(rules, c.mood).xpMod);
}

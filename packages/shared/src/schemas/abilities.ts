import { z } from 'zod';
import { Fraction, Id, PositiveInt, PositiveNumber } from './common';

/** Estados temporales que una habilidad puede dejar en una criatura. */
export const StatusKind = z.enum(['root', 'slow', 'stun', 'weaken']);
export type StatusKind = z.infer<typeof StatusKind>;

/** Cosas a las que una criatura puede ser inmune (miedo y veneno todavía no tienen fuente; el fuego, sí en trampas). */
export const ImmunityKind = z.enum(['fear', 'poison', 'fire']);
export type ImmunityKind = z.infer<typeof ImmunityKind>;

/** Qué hace una habilidad. Las pasivas están siempre activas desde su nivel; las activas las lanza la criatura sola. */
export const AbilityEffect = z.discriminatedUnion('type', [
  // ---- pasivas ----
  /** Se cura esta fracción del daño que hace (Drenar). */
  z.strictObject({ type: z.literal('lifesteal'), fraction: Fraction }),
  /** Más daño a objetivos con poca vida (Ejecución). */
  z.strictObject({
    type: z.literal('executeBonus'),
    belowHpFraction: Fraction,
    damageBonus: PositiveNumber,
  }),
  /** Los enemigos de nivel `maxEnemyLevel` o menos cerca (radiusTiles) hacen menos daño (Intimidar). */
  z.strictObject({
    type: z.literal('auraDamageMod'),
    maxEnemyLevel: PositiveInt,
    damageMod: z.number().min(-1).max(0),
  }),
  /** Recibe menos daño si lleva `stillSeconds` sin moverse (Guardia). */
  z.strictObject({
    type: z.literal('stillGuard'),
    stillSeconds: PositiveNumber,
    damageTakenMod: z.number().min(-1).max(0),
  }),
  /** Al morir, con esta probabilidad vuelve con esa fracción de vida, una vez por vida (Rearmarse). */
  z.strictObject({ type: z.literal('reassemble'), chance: Fraction, hpFraction: Fraction }),
  /** Inmune a esos efectos (No muerto). */
  z.strictObject({ type: z.literal('immunity'), to: z.array(ImmunityKind).min(1) }),
  /** Con la sala pedida, revive tras `reviveSeconds` con `levelLoss` niveles menos (Inmortal). */
  z.strictObject({
    type: z.literal('undying'),
    reviveSeconds: PositiveNumber,
    levelLoss: PositiveInt,
    requiresRoom: Id,
  }),
  /** Camina por esos terrenos (agua, lava) y es inmune a lo que diga `immuneTo` (Vuelo, Hija de la lava). */
  z.strictObject({
    type: z.literal('crossTerrain'),
    terrains: z.array(Id).min(1),
    immuneTo: z.array(ImmunityKind).optional(),
  }),
  /** Una bofetada le sube el ánimo en vez de bajárselo (Disfruta el dolor). */
  z.strictObject({ type: z.literal('moodOnSlap'), delta: PositiveNumber }),
  // ---- activas ----
  /** Deja un estado (durationSeconds) en el objetivo o, con radiusTiles, en los enemigos de alrededor. */
  z.strictObject({ type: z.literal('status'), status: StatusKind, value: z.number() }),
  /** Corre hasta el objetivo y lo aturde durante durationSeconds (Carga). */
  z.strictObject({ type: z.literal('charge') }),
  /** Salta sobre el objetivo y hace daño × `damageMultiplier` a los enemigos en radiusTiles (Picada). */
  z.strictObject({ type: z.literal('dive'), damageMultiplier: PositiveNumber }),
]);
export type AbilityEffect = z.infer<typeof AbilityEffect>;

export const ACTIVE_EFFECTS = ['status', 'charge', 'dive'] as const;

/** Una entrada de abilities.json (ASSETS.md §3). Solo las de nivel de desbloqueo hasta `progression.maxLevel`. */
export const AbilityDef = z.strictObject({
  id: Id,
  /** Criatura a la que pertenece (id de creatures.json). */
  creature: Id,
  name: z.string().min(1),
  kind: z.enum(['active', 'passive']),
  unlockLevel: PositiveInt,
  /** Solo activas. */
  cooldownSeconds: PositiveNumber.optional(),
  /** Solo activas: distancia máxima al objetivo; en pasivas, no se usa. */
  rangeTiles: PositiveNumber.optional(),
  /** Área (activas de zona, Picada) o radio del efecto (Intimidar). */
  radiusTiles: PositiveNumber.optional(),
  durationSeconds: PositiveNumber.optional(),
  effect: AbilityEffect,
});
export type AbilityDef = z.infer<typeof AbilityDef>;

export const AbilitiesFile = z.array(AbilityDef);
export type AbilitiesFile = z.infer<typeof AbilitiesFile>;

import { z } from 'zod';
import { Fraction, Id, NonNegativeInt, PositiveInt, PositiveNumber, Seconds } from './common';

/** A qué se puede apuntar un hechizo. */
export const SpellTarget = z.enum(['ownClaimedTile', 'visibleTile', 'ownCreature']);

/** Efectos de hechizo del MVP (sección 6.12). Cada uno con sus propios parámetros. */
export const SpellEffect = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('spawnImp') }),
  z.strictObject({ type: z.literal('rallyPoint'), durationSeconds: PositiveNumber }),
  z.strictObject({
    type: z.literal('haste'),
    moveSpeedBonus: PositiveNumber,
    attackSpeedBonus: PositiveNumber,
    durationSeconds: PositiveNumber,
  }),
  z.strictObject({
    type: z.literal('heal'),
    maxHpFraction: Fraction,
    overSeconds: PositiveNumber,
  }),
  z.strictObject({
    type: z.literal('areaDamage'),
    damage: PositiveInt,
    radius: PositiveNumber,
    damagesHeart: z.boolean(),
    damagesRooms: z.boolean(),
  }),
]);
export type SpellEffect = z.infer<typeof SpellEffect>;

/** Una entrada de spells.json. */
export const SpellDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  mana: NonNegativeInt,
  /** Crear Imp: maná extra por cada Imp por encima de los iniciales. */
  manaPerExtraImp: NonNegativeInt.optional(),
  cooldownSeconds: Seconds,
  target: SpellTarget,
  effect: SpellEffect,
  /** En MVP-1 todos están disponibles desde el inicio. */
  availableFromStart: z.boolean(),
});
export type SpellDef = z.infer<typeof SpellDef>;

export const SpellsFile = z.array(SpellDef).min(1);
export type SpellsFile = z.infer<typeof SpellsFile>;

import { z } from 'zod';
import { Id, NonNegativeInt, PositiveInt, PositiveNumber } from './common';

export const JobClass = z.enum(['worker', 'scout', 'fighter', 'thinker']);
export const FightStyle = z.enum(['blitzer', 'blocker', 'flanker', 'support', 'none']);
export const Tier = z.enum(['common', 'elite', 'unique']);

/** Una entrada de creatures.json (secciones 6.8 y 7.1 del plan). */
export const CreatureDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  modelId: z.string().min(1),
  tier: Tier,
  jobClass: JobClass,
  fightStyle: FightStyle,
  base: z.strictObject({
    hp: PositiveInt,
    damage: NonNegativeInt,
    /** Segundos entre golpes. */
    attackInterval: PositiveNumber,
    /** Tiles. Mayor que 1 = ataque a distancia. */
    range: PositiveNumber,
    /** Tiles por segundo. */
    speed: PositiveNumber,
    wage: NonNegativeInt,
    /** Tiles de Guarida que ocupa su cama. 0 = no necesita cama. */
    lairTiles: NonNegativeInt,
  }),
  needs: z.strictObject({
    eats: z.boolean(),
    sleeps: z.boolean(),
    paid: z.boolean(),
    hasMood: z.boolean(),
  }),
  /** null = no llega por el Portal (el Imp se crea con un hechizo). */
  attraction: z
    .strictObject({
      requires: z.array(z.strictObject({ room: Id, minTiles: PositiveInt.optional() })).min(1),
      attractWeight: PositiveNumber,
    })
    .nullable(),
  enemies: z.array(Id),
  flags: z.array(z.string().min(1)),
});
export type CreatureDef = z.infer<typeof CreatureDef>;

export const CreaturesFile = z.array(CreatureDef).min(1);
export type CreaturesFile = z.infer<typeof CreaturesFile>;

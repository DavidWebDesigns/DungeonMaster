import { z } from 'zod';
import { Id, NonNegativeInt, PositiveInt, PositiveNumber } from './common';

export const JobClass = z.enum(['worker', 'scout', 'fighter', 'thinker']);
export const FightStyle = z.enum(['blitzer', 'blocker', 'flanker', 'support', 'none']);
/** Género gramatical del nombre, para que el consejero hable bien ("un Verdugo", "una Torturadora"). */
export const Gender = z.enum(['m', 'f']);

export const Tier = z.enum(['common', 'elite', 'unique']);

/** Una entrada de creatures.json (secciones 6.8 y 7.1 del plan). */
export const CreatureDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  modelId: z.string().min(1),
  /** Si no se indica, masculino. */
  gender: Gender.optional(),
  tier: Tier,
  /** Amenaza de 1 a 10 (informativa: ayuda a comparar y a equilibrar criaturas). */
  threat: PositiveNumber.optional(),
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
      /**
       * Cupos: cuántas criaturas vivas de esta especie puede tener el jugador. Sin `slots`, no hay límite.
       * `fromRoom`: 1 cupo por cada sala construida de ese tipo. `fromCreature`: 1 cupo por cada `unlockEvery`
       * criaturas vivas de la especie base (por ejemplo, un Troll por cada 3 Goblins).
       */
      slots: z
        .union([
          z.strictObject({ fromRoom: Id }),
          z.strictObject({ fromCreature: Id, unlockEvery: PositiveInt }),
        ])
        .optional(),
      /** Tope duro de criaturas vivas de esta especie por jugador, con cupos o sin ellos (por ejemplo, un solo Ángel caído). */
      maxPerPlayer: PositiveInt.optional(),
    })
    .nullable(),
  enemies: z.array(Id),
  flags: z.array(z.string().min(1)),
});
export type CreatureDef = z.infer<typeof CreatureDef>;

export const CreaturesFile = z.array(CreatureDef).min(1);
export type CreaturesFile = z.infer<typeof CreaturesFile>;

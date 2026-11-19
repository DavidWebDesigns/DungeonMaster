import { z } from 'zod';
import { Id, PositiveInt, PositiveNumber, Seconds } from './common';

/** Cómo juega el bot en una dificultad. Son los mismos ajustes que acepta `createBot`. */
export const PveBotSettings = z.strictObject({
  /** Imps que intenta mantener. */
  targetImps: PositiveInt,
  /** Criaturas de nivel 3 o más que junta antes de atacar. */
  attackArmy: PositiveInt,
  /** Si pasa este tiempo con al menos 4 criaturas, ataca aunque no sean tantas. */
  attackAfterSeconds: Seconds,
});

export const PveDifficulty = z.strictObject({
  id: Id,
  name: z.string().min(1),
  bot: PveBotSettings,
});
export type PveDifficulty = z.infer<typeof PveDifficulty>;

/** pve.json: modo de juego contra bots (sin otros jugadores). */
export const PveConfig = z.strictObject({
  /** Rivales por defecto (bots). */
  defaultRivals: PositiveInt,
  defaultDifficulty: Id,
  /** Velocidades de juego que se pueden elegir (1 = normal). */
  speeds: z.array(PositiveNumber).min(1),
  difficulties: z.array(PveDifficulty).min(1),
});
export type PveConfig = z.infer<typeof PveConfig>;

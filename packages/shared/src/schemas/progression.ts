import { z } from 'zod';
import { NonNegativeInt, PositiveInt, PositiveNumber } from './common';

/** progression.json: niveles y experiencia (sección 6.8). */
export const ProgressionConfig = z.strictObject({
  maxLevel: PositiveInt,
  /** mult(n) = 1 + levelMultiplierStep × (n − 1). */
  levelMultiplierStep: PositiveNumber,
  /** Estadísticas que escalan con el nivel. */
  scalesWithLevel: z.array(z.enum(['hp', 'damage', 'wage'])).min(1),
  /** XP para pasar de nivel n a n+1; longitud = maxLevel − 1, estrictamente creciente. */
  xpToNextLevel: z.array(PositiveInt).min(1),
  xpPerHit: NonNegativeInt,
  xpPerKillPerEnemyLevel: NonNegativeInt,
  /** Ids de criaturas que no dan XP al morir (el Imp). */
  noXpOnDeath: z.array(z.string().min(1)),
});
export type ProgressionConfig = z.infer<typeof ProgressionConfig>;

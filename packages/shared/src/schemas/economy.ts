import { z } from 'zod';
import { Fraction, NonNegativeNumber, PositiveInt, PositiveNumber, Seconds } from './common';

/** economy.json: oro, día de pago, hambre y sueño (secciones 6.7 y 6.9). */
export const EconomyConfig = z.strictObject({
  paydayIntervalSeconds: PositiveNumber,
  impCarryGold: PositiveInt,
  /** Oro que un Imp extrae por segundo de una veta. */
  miningGoldPerSecond: PositiveNumber,
  hunger: z.strictObject({
    max: PositiveNumber,
    risePerSecond: PositiveNumber,
    eatThreshold: PositiveNumber,
    starvationHpFractionPerSecond: Fraction,
  }),
  sleep: z.strictObject({
    max: PositiveNumber,
    risePerSecond: PositiveNumber,
    sleepThreshold: PositiveNumber,
    restSeconds: Seconds,
    /** Descansando en una cama de la Guarida se recupera `lairHealFraction` de la vida máxima cada `lairHealIntervalSeconds`. */
    lairHealFraction: Fraction,
    lairHealIntervalSeconds: PositiveNumber,
  }),
  /**
   * Cada tile de una sala cuesta este factor más que el anterior de la misma sala (1,2 = +20 %): el tile n cuesta
   * `goldPerTile × factor^(n-1)`. Al ampliar una sala se continúa desde su tamaño; una sala nueva vuelve al precio base.
   */
  roomCostGrowthPerTile: PositiveNumber,
  wanderRadius: NonNegativeNumber,
  /** Pausa entre dos paseos de una criatura ociosa (al azar entre min y max). */
  wanderPauseSeconds: z.strictObject({ min: NonNegativeNumber, max: NonNegativeNumber }),
});
export type EconomyConfig = z.infer<typeof EconomyConfig>;

import { z } from 'zod';
import { Fraction, NonNegativeNumber, PositiveNumber, Seconds } from './common';

export const MoodBandId = z.enum(['radiant', 'happy', 'neutral', 'unhappy', 'angry', 'furious']);
export type MoodBandId = z.infer<typeof MoodBandId>;

export const MoodBehavior = z.enum(['normal', 'complains', 'headsToPortal', 'leaves']);

/** Una banda de ánimo (sección 6.9). Modificadores como fracción: 0.15 = +15 %. */
export const MoodBand = z.strictObject({
  id: MoodBandId,
  name: z.string().min(1),
  min: z.number().int().min(0).max(100),
  max: z.number().int().min(0).max(100),
  damageMod: z.number().min(-1),
  /** null = trabajo detenido. */
  workSpeedMod: z.number().min(-1).nullable(),
  xpMod: z.number().min(-1),
  behavior: MoodBehavior,
});
export type MoodBand = z.infer<typeof MoodBand>;

/** mood.json */
export const MoodConfig = z.strictObject({
  min: z.literal(0),
  max: z.literal(100),
  start: z.number().min(0).max(100),
  /** moodObjetivo = clamp(baseline + Σ peso × satisfacción, min, max). */
  baseline: z.number().min(0).max(100),
  /** mood += (objetivo − mood) × approachRatePerSecond, una vez por segundo. */
  approachRatePerSecond: Fraction,
  needs: z.strictObject({
    wage: z.strictObject({
      weight: PositiveNumber,
      /** La satisfacción por sueldo vuelve hacia 0 a este ritmo por segundo. */
      decayPerSecond: NonNegativeNumber,
    }),
    lair: z.strictObject({ weight: PositiveNumber }),
    food: z.strictObject({ weight: PositiveNumber }),
  }),
  slapMoodPenalty: NonNegativeNumber,
  angryIgnoreOrderChance: Fraction,
  furiousLeaveSeconds: Seconds,
  /** Bandas de mayor a menor; deben cubrir 0..100 sin huecos ni solapes. */
  bands: z.array(MoodBand).min(1),
});
export type MoodConfig = z.infer<typeof MoodConfig>;

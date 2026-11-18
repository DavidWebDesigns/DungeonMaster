import { z } from 'zod';

/** Identificador en camelCase: 'goblin', 'trainingRoom', 'callToArms'. */
export const Id = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*$/, 'debe ser un id en camelCase (ej. "goblin")');

export const PositiveNumber = z.number().positive();
export const NonNegativeNumber = z.number().nonnegative();
export const PositiveInt = z.number().int().positive();
export const NonNegativeInt = z.number().int().nonnegative();
/** Fracción entre 0 y 1 (ej. 0.25 = 25 %). */
export const Fraction = z.number().min(0).max(1);
/** Segundos de juego. */
export const Seconds = z.number().nonnegative();

export const Size = z.strictObject({ w: PositiveInt, h: PositiveInt });
export type Size = z.infer<typeof Size>;

export const Point = z.strictObject({ x: NonNegativeInt, y: NonNegativeInt });
export type Point = z.infer<typeof Point>;

export const Rect = z.strictObject({
  x: NonNegativeInt,
  y: NonNegativeInt,
  w: PositiveInt,
  h: PositiveInt,
});
export type Rect = z.infer<typeof Rect>;

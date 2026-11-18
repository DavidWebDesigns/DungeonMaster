import { z } from 'zod';
import { Id, NonNegativeInt, PositiveNumber } from './common';

/** Una entrada de terrain.json (sección 6.2 del plan). */
export const TerrainDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  /** Carácter que representa este terreno en las filas del mapa. */
  char: z.string().length(1),
  walkable: z.boolean(),
  /** Se puede marcar para excavar (tierra, veta de oro). */
  diggable: z.boolean(),
  /** Un Imp puede reforzarlo cuando está junto a suelo propio. */
  reinforceable: z.boolean(),
  /** Puede tener dueño (suelo reclamado, muro reforzado). */
  ownable: z.boolean(),
  /** Se pueden construir salas encima si es propio. */
  buildable: z.boolean(),
  digSeconds: PositiveNumber.optional(),
  goldPerTile: NonNegativeInt.optional(),
  becomesOnDig: Id.optional(),
  becomesOnReinforce: Id.optional(),
  becomesOnClaim: Id.optional(),
});
export type TerrainDef = z.infer<typeof TerrainDef>;

export const TerrainFile = z.array(TerrainDef).min(1);
export type TerrainFile = z.infer<typeof TerrainFile>;

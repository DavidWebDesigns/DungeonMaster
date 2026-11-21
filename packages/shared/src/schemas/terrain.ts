import { z } from 'zod';
import { Id, NonNegativeInt, PositiveInt, PositiveNumber } from './common';

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
  /** Tapa la línea de visión de los ataques a distancia (muros y rocas; no el agua ni la lava). */
  blocksSight: z.boolean(),
  digSeconds: PositiveNumber.optional(),
  /** Oro que da una veta antes de agotarse. Una veta es cualquier terreno con esto o con `infinite`. */
  goldPerTile: NonNegativeInt.optional(),
  /** Veta que nunca se agota (diamantes): da oro mientras haya un Imp minándola y quede sitio en la Tesorería. No lleva goldPerTile. */
  infinite: z.boolean().optional(),
  /** Nivel de un muro reforzado (1, 2...). El comando `reinforce` con `level: N` lleva al muro de ese nivel. */
  wallLevel: PositiveInt.optional(),
  /** Segundos que tarda un Imp en reforzar este terreno (si falta, `work.reinforceSeconds`). */
  reinforceSeconds: PositiveNumber.optional(),
  /** Sala que el jugador debe tener, con al menos `minLevel` tiles conectados, para reforzar este terreno al siguiente nivel. */
  reinforceRequires: z.strictObject({ room: Id, minLevel: PositiveInt }).optional(),
  becomesOnDig: Id.optional(),
  becomesOnReinforce: Id.optional(),
  becomesOnClaim: Id.optional(),
});
export type TerrainDef = z.infer<typeof TerrainDef>;

export const TerrainFile = z.array(TerrainDef).min(1);
export type TerrainFile = z.infer<typeof TerrainFile>;

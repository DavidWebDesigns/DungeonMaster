import { z } from 'zod';
import { Fraction, Id, NonNegativeInt, PositiveInt, PositiveNumber, Size } from './common';

/**
 * Una entrada de rooms.json (sección 6.7 del plan).
 * Los campos opcionales son parámetros propios de cada tipo de sala; la validación cruzada
 * (data/validateDataSet.ts) exige los que cada sala del MVP necesita.
 */
export const RoomDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  modelId: z.string().min(1),
  /** false para Corazón y Portal: vienen en el mapa y no se construyen ni venden. */
  buildable: z.boolean(),
  goldPerTile: NonNegativeInt,
  /** Salas que el jugador debe tener construidas antes de poder construir esta (progresión). */
  requiresRooms: z.array(Id).optional(),
  minSize: Size,
  sellRefund: Fraction,
  /** Tesorería: oro que cabe por tile. */
  goldCapacityPerTile: PositiveInt.optional(),
  /** Criadero: un pollo cada N segundos por cada `tilesPerProducer` tiles. */
  chickenIntervalSeconds: PositiveNumber.optional(),
  tilesPerProducer: PositiveInt.optional(),
  maxChickensPerTile: PositiveInt.optional(),
  /** Sala de entrenamiento. */
  trainingXpPerSecond: PositiveNumber.optional(),
  trainingMaxLevel: PositiveInt.optional(),
  trainingGoldPerSecond: NonNegativeInt.optional(),
  tilesPerTrainee: PositiveInt.optional(),
});
export type RoomDef = z.infer<typeof RoomDef>;

export const RoomsFile = z.array(RoomDef).min(1);
export type RoomsFile = z.infer<typeof RoomsFile>;

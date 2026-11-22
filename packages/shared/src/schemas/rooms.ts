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
  /**
   * Tiles conectados máximos de una sala de este tipo = su nivel máximo. El tile siguiente abre una sala nueva de
   * nivel 1. Obligatorio en las salas construibles; el Corazón y el Portal no lo llevan.
   */
  maxTiles: PositiveInt.optional(),
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
  /** Templo: maná por segundo que da cada tile (se suma al maná normal, sin pasar por su tope). */
  manaPerTilePerSecond: PositiveNumber.optional(),
  /** Biblioteca: con al menos `manaPulseMinLevel` tiles (su nivel), da `manaPulseAmount` de maná cada `manaPulseSeconds`. */
  manaPulseMinLevel: PositiveInt.optional(),
  manaPulseAmount: PositiveNumber.optional(),
  manaPulseSeconds: PositiveNumber.optional(),
  /**
   * Casino: las criaturas con sueldo van a gastar parte de lo que cobran y salen divertidas. Un asiento por cada
   * `casinoTilesPerSeat` tiles; la visita dura `casinoStaySeconds`; gastan `casinoSpendFraction` de su sueldo, y la casa
   * (la Tesorería del jugador) se queda `casinoHouseShare` de lo gastado. Al salir, `casinoBonusSeconds` segundos de
   * entrenamiento con `casinoTrainingBonus` más de experiencia (0,5 = +50 %).
   */
  casinoTilesPerSeat: PositiveInt.optional(),
  casinoStaySeconds: PositiveNumber.optional(),
  casinoSpendFraction: Fraction.optional(),
  casinoHouseShare: Fraction.optional(),
  casinoTrainingBonus: PositiveNumber.optional(),
  casinoBonusSeconds: PositiveNumber.optional(),
});
export type RoomDef = z.infer<typeof RoomDef>;

export const RoomsFile = z.array(RoomDef).min(1);
export type RoomsFile = z.infer<typeof RoomsFile>;

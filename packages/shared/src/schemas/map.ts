import { z } from 'zod';
import { Id, NonNegativeInt, Point, PositiveInt, Rect } from './common';

/** Base de un jugador dentro del mapa (sección 6.4). */
export const MapBase = z.strictObject({
  slot: NonNegativeInt,
  /** Zona inicial ya excavada y reclamada. */
  claimed: Rect,
  heart: Rect,
  rooms: z.array(z.strictObject({ type: Id, rect: Rect })),
  imps: z.array(Point),
});
export type MapBase = z.infer<typeof MapBase>;

/** Archivo de mapa: data/mvp/maps/<id>.json */
export const MapFile = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  width: PositiveInt,
  height: PositiveInt,
  /** Una cadena por fila (y), un carácter por tile (x). Los caracteres vienen de terrain.json. */
  rows: z.array(z.string()).min(1),
  bases: z.array(MapBase).min(1),
});
export type MapFile = z.infer<typeof MapFile>;

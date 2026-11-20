import type { Point } from '@dm/shared';

/** Índice de tile (y * ancho + x) → coordenadas. */
export const tileXY = (width: number, tile: number): Point => ({
  x: tile % width,
  y: Math.floor(tile / width),
});

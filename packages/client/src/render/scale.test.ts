import { describe, expect, it } from 'vitest';
import { IMP_HEIGHT, IMP_RADIUS, TILE_GROWTH, TILE_TO_IMP_WIDTH, UNIT_SCALE } from './scale';

describe('proporciones', () => {
  it('el lado de un tile mide entre 5 y 6,5 veces el ancho de un Imp (los tiles se agrandaron un 30 %)', () => {
    expect(TILE_TO_IMP_WIDTH).toBeGreaterThanOrEqual(5);
    expect(TILE_TO_IMP_WIDTH).toBeLessThanOrEqual(6.5);
    expect(UNIT_SCALE * TILE_GROWTH).toBeCloseTo(1, 10);
    // Exactamente un 30 % más que antes (4,5 veces).
    expect(TILE_TO_IMP_WIDTH).toBeCloseTo((1 / (2 * 0.11)) * TILE_GROWTH, 5);
  });

  it('el Imp cabe de sobra dentro de un tile y no es más alto que un muro', () => {
    expect(IMP_RADIUS * 2).toBeLessThan(0.5);
    expect(IMP_HEIGHT).toBeLessThan(1);
  });
});

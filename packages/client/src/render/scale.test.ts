import { describe, expect, it } from 'vitest';
import { IMP_HEIGHT, IMP_RADIUS, TILE_TO_IMP_WIDTH } from './scale';

describe('proporciones', () => {
  it('el lado de un tile mide entre 4 y 5 veces el ancho de un Imp', () => {
    expect(TILE_TO_IMP_WIDTH).toBeGreaterThanOrEqual(4);
    expect(TILE_TO_IMP_WIDTH).toBeLessThanOrEqual(5);
  });

  it('el Imp cabe de sobra dentro de un tile y no es más alto que un muro', () => {
    expect(IMP_RADIUS * 2).toBeLessThan(0.5);
    expect(IMP_HEIGHT).toBeLessThan(1);
  });
});

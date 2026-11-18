import { describe, expect, it } from 'vitest';
import { toNdc } from './domInput';

const rect = { left: 10, top: 20, width: 200, height: 100 };

describe('toNdc', () => {
  it('el centro del lienzo es (0, 0)', () => {
    expect(toNdc(110, 70, rect)).toEqual({ nx: 0, ny: 0 });
  });

  it('las esquinas son ±1 y arriba es positivo', () => {
    expect(toNdc(10, 20, rect)).toEqual({ nx: -1, ny: 1 });
    expect(toNdc(210, 120, rect)).toEqual({ nx: 1, ny: -1 });
  });
});

import { describe, expect, it } from 'vitest';
import { speedLabel } from './speedLabel';

describe('speedLabel', () => {
  it('a velocidad normal o en red no muestra nada', () => {
    expect(speedLabel(false, 1)).toBe('');
    expect(speedLabel(false, undefined)).toBe('');
  });
  it('muestra la velocidad acelerada y la pausa (que manda sobre la velocidad)', () => {
    expect(speedLabel(false, 4)).toBe('×4');
    expect(speedLabel(true, 4)).toBe('⏸ Pausa');
  });
});

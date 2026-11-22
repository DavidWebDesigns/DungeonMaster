import { describe, expect, it } from 'vitest';
import { roomLook } from './roomProps';

describe('roomLook: la sala cambia de tamaño y forma con el nivel', () => {
  it('el nivel 1 es el aspecto de siempre: sin torre, anillo ni joya', () => {
    const l = roomLook(1);
    expect(l).toMatchObject({
      level: 1,
      tier: 1,
      girth: 1,
      height: 1,
      tower: null,
      ring: false,
      crown: false,
    });
  });

  it('crece de forma continua con el nivel (accesorios más gruesos y más altos)', () => {
    let prev = roomLook(1);
    for (let lv = 2; lv <= 10; lv++) {
      const l = roomLook(lv);
      expect(l.girth).toBeGreaterThan(prev.girth);
      expect(l.height).toBeGreaterThan(prev.height);
      prev = l;
    }
    expect(roomLook(10).height).toBeCloseTo(1.35, 5);
    expect(roomLook(10).girth).toBeCloseTo(1.2, 5);
  });

  it('gana piezas por tramos: torre en el nivel 4, anillo en el 7 y joya en el 10', () => {
    expect(roomLook(3).tower).toBeNull();
    expect(roomLook(4).tower).not.toBeNull();
    expect(roomLook(6).ring).toBe(false);
    expect(roomLook(7).ring).toBe(true);
    expect(roomLook(9).crown).toBe(false);
    expect(roomLook(10).crown).toBe(true);
    expect([1, 3, 4, 6, 7, 9, 10].map((lv) => roomLook(lv).tier)).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });

  it('la torre se hace más alta y ancha con el nivel y es cónica', () => {
    const a = roomLook(4).tower!;
    const b = roomLook(10).tower!;
    expect(b.height).toBeGreaterThan(a.height);
    expect(b.baseDiameter).toBeGreaterThan(a.baseDiameter);
    expect(b.topDiameter).toBeLessThan(b.baseDiameter);
  });

  it('los tramos siguen al nivel máximo de la sala, y los valores raros se acotan', () => {
    expect(roomLook(5, 5).crown).toBe(true);
    expect(roomLook(0).level).toBe(1);
    expect(roomLook(99).level).toBe(10);
  });
});

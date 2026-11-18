import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, seedToState, shuffled } from './rng';

const make = (seed: number) => ({ rng: seedToState(seed) });

describe('mulberry32', () => {
  it('la misma semilla da la misma secuencia', () => {
    const a = make(42);
    const b = make(42);
    for (let i = 0; i < 1000; i++) expect(nextFloat(a)).toBe(nextFloat(b));
  });

  it('semillas distintas divergen', () => {
    const a = make(1);
    const b = make(2);
    const seqA = Array.from({ length: 5 }, () => nextFloat(a));
    const seqB = Array.from({ length: 5 }, () => nextFloat(b));
    expect(seqA).not.toEqual(seqB);
  });

  it('da valores conocidos (referencia fija de mulberry32 con semilla 1)', () => {
    const r = make(1);
    expect(nextFloat(r)).toBeCloseTo(0.6270739405881613, 12);
    expect(nextFloat(r)).toBeCloseTo(0.002735721180215478, 12);
  });

  it('produce valores en [0, 1) y bien repartidos', () => {
    const r = make(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const v = nextFloat(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10000).toBeGreaterThan(0.48);
    expect(sum / 10000).toBeLessThan(0.52);
  });

  it('el estado se puede guardar y restaurar a mitad de secuencia', () => {
    const a = make(99);
    for (let i = 0; i < 10; i++) nextFloat(a);
    const saved = JSON.parse(JSON.stringify(a)) as { rng: number };
    expect(Array.from({ length: 5 }, () => nextFloat(a))).toEqual(
      Array.from({ length: 5 }, () => nextFloat(saved)),
    );
  });

  it('nextInt queda dentro del rango', () => {
    const r = make(3);
    for (let i = 0; i < 1000; i++) {
      const n = nextInt(r, 6);
      expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
    }
  });

  it('shuffled es una permutación determinista que no toca el original', () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    const a = shuffled(make(5), items);
    expect(shuffled(make(5), items)).toEqual(a);
    expect([...a].sort()).toEqual(items);
    expect(items).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

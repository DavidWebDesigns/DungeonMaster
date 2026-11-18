import { describe, expect, it } from 'vitest';
import { parseDataSet, type DataSet, type Rect } from '@dm/shared';
import { realRawData } from '../../packages/shared/src/data/testUtils';
import { rotatePoint, rotateRect } from './generate';

function data(): DataSet {
  const r = parseDataSet(realRawData());
  if (!r.ok) throw new Error(JSON.stringify(r.errors, null, 2));
  return r.data;
}

const tile = (d: DataSet, x: number, y: number) => {
  const ch = d.map.rows[y]?.[x];
  return d.terrain.find((t) => t.char === ch)!;
};

const rectTiles = (r: Rect) => {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push({ x, y });
  return out;
};

describe('rotación', () => {
  it('cuatro rotaciones devuelven el punto original', () => {
    const p = { x: 7, y: 3 };
    expect(rotatePoint(p, 4)).toEqual(p);
    expect(rotatePoint(p, 1)).toEqual({ x: 60, y: 7 });
  });

  it('rota rectángulos conservando el área', () => {
    const r = { x: 14, y: 4, w: 3, h: 2 };
    const r1 = rotateRect(r, 1);
    expect(r1.w * r1.h).toBe(6);
    expect(rotateRect(r, 4)).toEqual(r);
  });
});

describe('map-4p-01', () => {
  const d = data();
  const { map } = d;

  it('mide 64×64 y tiene borde de roca', () => {
    expect(map.rows).toHaveLength(64);
    for (let i = 0; i < 64; i++) {
      expect(tile(d, i, 0).id).toBe('solidRock');
      expect(tile(d, 0, i).id).toBe('solidRock');
      expect(tile(d, i, 63).id).toBe('solidRock');
      expect(tile(d, 63, i).id).toBe('solidRock');
    }
  });

  it('tiene simetría de rotación de 90°: las cuatro esquinas son equivalentes', () => {
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const r = rotatePoint({ x, y }, 1);
        expect(map.rows[r.y]![r.x], `(${x},${y}) → (${r.x},${r.y})`).toBe(map.rows[y]![x]);
      }
  });

  it('las bases son rotaciones exactas de la base 0', () => {
    const b0 = map.bases.find((b) => b.slot === 0)!;
    for (const b of map.bases) {
      expect(b.heart).toEqual(rotateRect(b0.heart, b.slot));
      expect(b.claimed).toEqual(rotateRect(b0.claimed, b.slot));
      expect(b.imps).toEqual(b0.imps.map((p) => rotatePoint(p, b.slot)));
    }
  });

  it('cada base tiene zona reclamada 9×9 con Corazón, Tesorería y Portal 3×3', () => {
    for (const b of map.bases) {
      expect(b.claimed.w).toBe(9);
      expect(b.claimed.h).toBe(9);
      for (const type of ['treasury', 'portal']) {
        const room = b.rooms.find((r) => r.type === type)!;
        expect(room.rect.w * room.rect.h).toBe(9);
      }
    }
  });

  it('cada base tiene entre 6 y 10 tiles de veta a 12 tiles o menos de su zona', () => {
    for (const b of map.bases) {
      const c = b.claimed;
      let veins = 0;
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          if (tile(d, x, y).id !== 'goldVein') continue;
          const dx = Math.max(c.x - x, 0, x - (c.x + c.w - 1));
          const dy = Math.max(c.y - y, 0, y - (c.y + c.h - 1));
          if (Math.max(dx, dy) <= 12) veins++;
        }
      expect(veins, `base ${b.slot}`).toBeGreaterThanOrEqual(6);
      expect(veins, `base ${b.slot}`).toBeLessThanOrEqual(10);
    }
  });

  it('hay una gran mina central disputada', () => {
    const center = rectTiles({ x: 29, y: 29, w: 6, h: 6 });
    expect(center.every((p) => tile(d, p.x, p.y).id === 'goldVein')).toBe(true);
  });

  it('desde cada base se puede excavar hasta el centro y hasta cada Corazón rival', () => {
    // BFS por tiles transitables o excavables: ninguna base queda encerrada por roca, agua o lava.
    const passable = (x: number, y: number) => {
      const t = tile(d, x, y);
      return t.walkable || t.diggable;
    };
    const reach = (from: { x: number; y: number }) => {
      const seen = new Set<string>([`${from.x},${from.y}`]);
      const queue = [from];
      while (queue.length) {
        const p = queue.shift()!;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const n = { x: p.x + dx, y: p.y + dy };
          const k = `${n.x},${n.y}`;
          if (n.x < 0 || n.y < 0 || n.x >= 64 || n.y >= 64 || seen.has(k) || !passable(n.x, n.y))
            continue;
          seen.add(k);
          queue.push(n);
        }
      }
      return seen;
    };
    const fromBase0 = reach(map.bases[0]!.imps[0]!);
    expect(fromBase0.has('31,31')).toBe(true);
    for (const b of map.bases) expect(fromBase0.has(`${b.imps[0]!.x},${b.imps[0]!.y}`)).toBe(true);
  });
});

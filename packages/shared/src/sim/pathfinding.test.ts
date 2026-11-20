import { describe, expect, it } from 'vitest';
import { distanceField, findPath } from './pathfinding';
import { octile } from './grid';

/** Mapa de texto: '#' bloquea, cualquier otra cosa se puede pisar. */
function grid(rows: string[]) {
  const height = rows.length;
  const width = rows[0]!.length;
  const walkable = (i: number) => rows[Math.floor(i / width)]![i % width] !== '#';
  const at = (x: number, y: number) => y * width + x;
  const query = (sx: number, sy: number, gx: number, gy: number) => ({
    width,
    height,
    walkable,
    start: at(sx, sy),
    isGoal: (i: number) => i === at(gx, gy),
    heuristic: (i: number) => octile({ width }, i, at(gx, gy), 1, 1.41),
    straightCost: 1,
    diagonalCost: 1.41,
  });
  return { width, at, query };
}

const cost = (width: number, start: number, path: number[]) => {
  let total = 0;
  let prev = start;
  for (const t of path) {
    const diag = prev % width !== t % width && Math.floor(prev / width) !== Math.floor(t / width);
    total += diag ? 1.41 : 1;
    prev = t;
  }
  return total;
};

describe('A*', () => {
  it('va en línea recta y en diagonal con los costes correctos', () => {
    const g = grid(['.....', '.....', '.....', '.....', '.....']);
    expect(findPath(g.query(0, 0, 4, 0))).toHaveLength(4);
    const diag = findPath(g.query(0, 0, 4, 4))!;
    expect(diag).toHaveLength(4);
    expect(cost(g.width, g.at(0, 0), diag)).toBeCloseTo(4 * 1.41);
  });

  it('rodea muros', () => {
    const g = grid(['.....', '.###.', '.....']);
    const p = findPath(g.query(0, 1, 4, 1))!;
    expect(p.at(-1)).toBe(g.at(4, 1));
    expect(p.every((t) => g.query(0, 0, 0, 0).walkable(t))).toBe(true);
  });

  it('no corta esquinas', () => {
    const g = grid(['.#', '#.']);
    expect(findPath(g.query(0, 0, 1, 1))).toBeNull();
    const g2 = grid(['.#.', '...']);
    const p = findPath(g2.query(0, 0, 2, 0))!;
    // Ninguna diagonal puede rozar el muro de (1,0): baja, cruza por abajo y sube en recto.
    expect(p).toEqual([g2.at(0, 1), g2.at(1, 1), g2.at(2, 1), g2.at(2, 0)]);
  });

  it('devuelve null si no hay ruta y [] si ya está en el destino', () => {
    const g = grid(['.#.', '.#.', '.#.']);
    expect(findPath(g.query(0, 0, 2, 0))).toBeNull();
    expect(findPath(g.query(0, 0, 0, 0))).toEqual([]);
  });

  it('encuentra una ruta óptima frente a Dijkstra (heurística nula)', () => {
    const g = grid([
      '..........',
      '.####.###.',
      '.#......#.',
      '.#.####.#.',
      '...#..#...',
      '.###.##.#.',
      '..........',
    ]);
    const q = g.query(0, 0, 9, 6);
    const a = findPath(q)!;
    const d = findPath({ ...q, heuristic: () => 0 })!;
    expect(cost(g.width, q.start, a)).toBeCloseTo(cost(g.width, q.start, d));
  });

  it('es determinista: mismas entradas, misma ruta', () => {
    const g = grid(['.......', '.......', '.......']);
    expect(findPath(g.query(0, 0, 6, 2))).toEqual(findPath(g.query(0, 0, 6, 2)));
  });

  it('acepta varios destinos y elige el más barato', () => {
    const g = grid(['.......']);
    const q = {
      ...g.query(3, 0, 0, 0),
      isGoal: (i: number) => i === 0 || i === 5,
      heuristic: () => 0,
    };
    expect(findPath(q)).toEqual([4, 5]);
  });
});

describe('distanceField', () => {
  const W = 7;
  const H = 5;
  // Un muro vertical en x=3 con un hueco abajo (y=4): ir de un lado al otro obliga a dar la vuelta.
  const wall = new Set([0, 1, 2, 3].map((y) => y * W + 3));
  const field = (start: number) =>
    distanceField({
      width: W,
      height: H,
      walkable: (t) => !wall.has(t),
      start,
      straightCost: 1,
      diagonalCost: 1.41,
    });

  it('la distancia de camino rodea el muro: es mayor que la línea recta', () => {
    const f = field(1 * W + 2);
    // Recta: 2 tiles; por el hueco de abajo hay que bajar, cruzar y subir.
    expect(f[1 * W + 4]).toBeGreaterThan(3);
    expect(f[1 * W + 4]).toBe(8);
  });

  it('es 0 en el origen, Infinity donde no se puede llegar y coincide con findPath', () => {
    const f = field(0);
    expect(f[0]).toBe(0);
    expect(f[3]).toBe(Infinity);
    const goal = 2 * W + 6;
    const path = findPath({
      width: W,
      height: H,
      walkable: (t) => !wall.has(t),
      start: 0,
      isGoal: (t) => t === goal,
      heuristic: () => 0,
      straightCost: 1,
      diagonalCost: 1.41,
    })!;
    let cost = 0;
    let prev = 0;
    for (const t of path) {
      const diag =
        Math.abs((t % W) - (prev % W)) === 1 &&
        Math.abs(Math.floor(t / W) - Math.floor(prev / W)) === 1;
      cost += diag ? 1.41 : 1;
      prev = t;
    }
    expect(f[goal]).toBeCloseTo(cost, 5);
  });
});

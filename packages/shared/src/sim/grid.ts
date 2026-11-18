import type { MatchState } from './types';

/** Vecinos ortogonales en orden fijo (arriba, derecha, abajo, izquierda). */
export const DIRS4: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Vecinos en 8 direcciones en orden fijo; las diagonales van al final. */
export const DIRS8: ReadonlyArray<readonly [number, number]> = [
  ...DIRS4,
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

export const tileIndex = (s: { width: number }, x: number, y: number): number => y * s.width + x;
export const tileX = (s: { width: number }, i: number): number => i % s.width;
export const tileY = (s: { width: number }, i: number): number => Math.floor(i / s.width);

export function inBounds(s: { width: number; height: number }, x: number, y: number): boolean {
  return (
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < s.width && y < s.height
  );
}

/** Índices de los vecinos ortogonales que existen, en orden fijo. */
export function neighbors4(s: { width: number; height: number }, i: number): number[] {
  const x = tileX(s, i);
  const y = tileY(s, i);
  const out: number[] = [];
  for (const [dx, dy] of DIRS4)
    if (inBounds(s, x + dx, y + dy)) out.push(tileIndex(s, x + dx, y + dy));
  return out;
}

/** Distancia octil entre dos tiles con los costes de movimiento dados. */
export function octile(
  s: { width: number },
  a: number,
  b: number,
  straight: number,
  diagonal: number,
): number {
  const dx = Math.abs(tileX(s, a) - tileX(s, b));
  const dy = Math.abs(tileY(s, a) - tileY(s, b));
  return straight * (dx + dy) + (diagonal - 2 * straight) * Math.min(dx, dy);
}

export function tileOfPosition(s: MatchState, x: number, y: number): number {
  return tileIndex(s, Math.floor(x), Math.floor(y));
}

/**
 * Generador del mapa del MVP (map-4p-01).
 *
 * Se diseña solo la esquina superior izquierda (slot 0) y se copia rotando 90° tres veces,
 * así las cuatro bases son exactamente equivalentes (sección 6.4 del plan).
 * Las cifras de este archivo son de diseño de nivel: describen dónde va cada cosa,
 * no reglas del juego. El resultado es data/mvp/maps/map-4p-01.json, que es lo que lee el juego.
 */
import type { MapBase, MapFile, Point, Rect } from '@dm/shared';

const SIZE = 64;

const CH = {
  rock: '#',
  earth: '.',
  gold: 'g',
  claimed: 'c',
  water: 'w',
  lava: 'l',
} as const;

type Ch = (typeof CH)[keyof typeof CH];

/** Rotación de 90° en sentido horario alrededor del centro del mapa. */
export function rotatePoint(p: Point, times: number, size = SIZE): Point {
  let { x, y } = p;
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) [x, y] = [size - 1 - y, x];
  return { x, y };
}

export function rotateRect(r: Rect, times: number, size = SIZE): Rect {
  const a = rotatePoint({ x: r.x, y: r.y }, times, size);
  const b = rotatePoint({ x: r.x + r.w - 1, y: r.y + r.h - 1 }, times, size);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

/** Rasgos del cuadrante del slot 0. Se replican en los otros tres. */
const QUADRANT: Array<{ ch: Ch; rect: Rect }> = [
  // Base inicial 9×9, ya excavada y reclamada.
  { ch: CH.claimed, rect: { x: 2, y: 2, w: 9, h: 9 } },
  // Dos vetas cercanas: 6 + 4 = 10 tiles (6.000 de oro).
  { ch: CH.gold, rect: { x: 14, y: 4, w: 3, h: 2 } },
  { ch: CH.gold, rect: { x: 4, y: 14, w: 2, h: 2 } },
  // Veta compartida en el borde, entre esta base y la siguiente (8 tiles).
  { ch: CH.gold, rect: { x: 30, y: 3, w: 4, h: 2 } },
  // Roca para dar forma a los caminos.
  { ch: CH.rock, rect: { x: 12, y: 12, w: 2, h: 2 } },
  { ch: CH.rock, rect: { x: 18, y: 14, w: 3, h: 2 } },
  { ch: CH.rock, rect: { x: 24, y: 8, w: 2, h: 4 } },
  // Decoración y obstáculos.
  { ch: CH.lava, rect: { x: 20, y: 6, w: 3, h: 2 } },
  { ch: CH.water, rect: { x: 7, y: 21, w: 2, h: 3 } },
  // Anillo de roca alrededor de la mina central, con aberturas en los lados.
  { ch: CH.rock, rect: { x: 26, y: 26, w: 3, h: 3 } },
];

/** Mina central disputada: 6×6 tiles en el centro exacto (simétrica por sí sola). */
const CENTER_GOLD: Rect = { x: 29, y: 29, w: 6, h: 6 };

const BASE_0: Omit<MapBase, 'slot'> = {
  claimed: { x: 2, y: 2, w: 9, h: 9 },
  heart: { x: 5, y: 5, w: 3, h: 3 },
  rooms: [
    { type: 'treasury', rect: { x: 2, y: 2, w: 3, h: 3 } },
    // El Portal mira hacia el centro del mapa.
    { type: 'portal', rect: { x: 8, y: 8, w: 3, h: 3 } },
  ],
  imps: [
    { x: 6, y: 3 },
    { x: 3, y: 6 },
    { x: 9, y: 6 },
    { x: 6, y: 9 },
  ],
};

export function generateMap(): MapFile {
  const grid: string[][] = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill(CH.earth));
  const fill = (r: Rect, ch: string) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y]![x] = ch;
  };

  // Borde de roca indestructible.
  for (let i = 0; i < SIZE; i++) {
    grid[0]![i] = CH.rock;
    grid[SIZE - 1]![i] = CH.rock;
    grid[i]![0] = CH.rock;
    grid[i]![SIZE - 1] = CH.rock;
  }

  for (let k = 0; k < 4; k++) for (const f of QUADRANT) fill(rotateRect(f.rect, k), f.ch);
  fill(CENTER_GOLD, CH.gold);

  const bases: MapBase[] = [0, 1, 2, 3].map((slot) => ({
    slot,
    claimed: rotateRect(BASE_0.claimed, slot),
    heart: rotateRect(BASE_0.heart, slot),
    rooms: BASE_0.rooms.map((r) => ({ type: r.type, rect: rotateRect(r.rect, slot) })),
    imps: BASE_0.imps.map((p) => rotatePoint(p, slot)),
  }));

  return {
    id: 'map-4p-01',
    name: 'Cuatro esquinas',
    width: SIZE,
    height: SIZE,
    rows: grid.map((row) => row.join('')),
    bases,
  };
}

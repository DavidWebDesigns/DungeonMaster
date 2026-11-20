/** Colores del juego gris: constantes visuales del cliente (no son números de juego). */
export type RGB = readonly [number, number, number];

/** Color de cada jugador, por id (1 a 4). */
export const PLAYER_COLORS: readonly RGB[] = [
  [0.88, 0.27, 0.23], // rojo
  [0.23, 0.48, 0.88], // azul
  [0.23, 0.77, 0.42], // verde
  [0.88, 0.69, 0.23], // amarillo
];

export function playerColor(id: number): RGB {
  return PLAYER_COLORS[(Math.max(1, id) - 1) % PLAYER_COLORS.length] as RGB;
}

/** Color de cada tipo de sala. */
export const ROOM_COLORS: Readonly<Record<string, RGB>> = {
  heart: [0.55, 0.12, 0.14],
  portal: [0.4, 0.2, 0.6],
  lair: [0.5, 0.36, 0.22],
  hatchery: [0.78, 0.7, 0.3],
  treasury: [0.7, 0.58, 0.18],
  trainingRoom: [0.55, 0.28, 0.2],
  library: [0.22, 0.34, 0.6],
  tortureChamber: [0.42, 0.18, 0.3],
  workshop: [0.36, 0.3, 0.27],
  graveyard: [0.27, 0.33, 0.31],
  temple: [0.46, 0.3, 0.52],
};

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

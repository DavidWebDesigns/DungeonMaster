/**
 * Minimapa: un píxel por tile. Lógica pura (devuelve los píxeles y traduce clics); el dibujo en el DOM está en
 * `minimapView.ts`. Usa los mismos colores que el terreno del juego, que ya llevan la niebla de guerra aplicada.
 */
import type { MatchState } from '@dm/shared';
import { playerColor, type RGB } from '../render/palette';

/** Lo que el minimapa necesita saber del estilo de cada tile (lo da `TerrainStyles`). */
export interface MinimapTile {
  color: RGB;
}

const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));

export interface MinimapInput {
  state: MatchState;
  tiles: readonly MinimapTile[];
  me: number;
  /** Con niebla: lo que se ve ahora. Sin ella (null), se ven todas las unidades. */
  visible: Uint8Array | null;
}

/** Imagen RGBA de ancho × alto píxeles (un píxel por tile). */
export function minimapPixels({ state, tiles, me, visible }: MinimapInput): Uint8ClampedArray {
  const { width, height } = state;
  const px = new Uint8ClampedArray(width * height * 4);
  const put = (i: number, c: RGB) => {
    px[i * 4] = toByte(c[0]);
    px[i * 4 + 1] = toByte(c[1]);
    px[i * 4 + 2] = toByte(c[2]);
    px[i * 4 + 3] = 255;
  };
  for (let i = 0; i < width * height; i++) put(i, tiles[i]?.color ?? [0, 0, 0]);

  const seen = (x: number, y: number) =>
    visible === null || visible[Math.floor(y) * width + Math.floor(x)] === 1;
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;

  // Corazones: un cuadrado de 3×3 del color del dueño (los de otros, solo si ya se descubrieron).
  for (const room of state.rooms) {
    if (room.type !== 'heart') continue;
    if (room.owner !== me && !room.tiles.some((t) => visible === null || visible[t] === 1))
      continue;
    for (const t of room.tiles) put(t, playerColor(room.owner));
  }
  // Imps y criaturas: tuyos siempre; los demás, solo a la vista.
  for (const u of [...state.imps, ...state.creatures]) {
    if (u.held || !inMap(u.x, u.y)) continue;
    if (u.owner !== me && !seen(u.x, u.y)) continue;
    put(
      Math.floor(u.y) * width + Math.floor(u.x),
      u.owner === me ? [1, 1, 1] : playerColor(u.owner),
    );
  }
  return px;
}

/** Tile (x, y) al que corresponde un punto del minimapa dado en píxeles de pantalla; null si cae fuera. */
export function minimapTileAt(
  px: number,
  py: number,
  size: { w: number; h: number },
  map: { width: number; height: number },
): { x: number; y: number } | null {
  if (px < 0 || py < 0 || px >= size.w || py >= size.h) return null;
  return { x: Math.floor((px / size.w) * map.width), y: Math.floor((py / size.h) * map.height) };
}

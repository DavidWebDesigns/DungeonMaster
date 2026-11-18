import { tileX, tileY } from './grid';

/** Avanza una entidad por su ruta (tiles por recorrer) la distancia dada. */
export function moveAlongPath(
  s: { width: number },
  e: { x: number; y: number; path: number[] },
  distance: number,
): void {
  let left = distance;
  while (left > 0 && e.path.length > 0) {
    const next = e.path[0] as number;
    const tx = tileX(s, next) + 0.5;
    const ty = tileY(s, next) + 0.5;
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= left) {
      e.x = tx;
      e.y = ty;
      left -= d;
      e.path.shift();
    } else {
      e.x += (dx / d) * left;
      e.y += (dy / d) * left;
      left = 0;
    }
  }
}

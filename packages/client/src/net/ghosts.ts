/**
 * "Fantasma" de las órdenes enviadas que el servidor aún no ha reflejado: se dibujan en el mapa con un resaltado tenue
 * para que el jugador vea al instante que su orden salió. Es solo dibujo: no cambia nada del juego.
 */
import type { Command, Point } from '@dm/shared';
import type { Preview } from '../input/inputModel';

export function ghostPreview(ghosts: readonly Command[]): Preview {
  const tiles: Point[] = [];
  for (const g of ghosts) {
    switch (g.type) {
      case 'dig':
      case 'claim':
      case 'reinforce':
        tiles.push(...g.tiles);
        break;
      case 'buildTrap':
        tiles.push(g.tile);
        break;
      case 'buildRoom':
        for (let y = g.rect.y; y < g.rect.y + g.rect.h; y++)
          for (let x = g.rect.x; x < g.rect.x + g.rect.w; x++) tiles.push({ x, y });
        break;
      default:
        break;
    }
  }
  return tiles.length === 0
    ? { kind: 'none' }
    : { kind: 'tiles', action: 'dig', valid: tiles, invalid: [] };
}

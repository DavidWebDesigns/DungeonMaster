import type { DataSet, MatchState, TaskKind } from '@dm/shared';
import { styleForTile, type TileStyle } from './tileStyle';

const same = (a: TileStyle, b: TileStyle) =>
  a.height === b.height &&
  a.color[0] === b.color[0] &&
  a.color[1] === b.color[1] &&
  a.color[2] === b.color[2];

/**
 * Guarda el aspecto actual de cada tile y dice cuáles cambiaron desde la última vez.
 * Así el motor gráfico solo reescribe los bloques que de verdad cambian.
 */
export class TerrainStyles {
  readonly styles: TileStyle[] = [];

  /** Recalcula todos los tiles y devuelve los que cambiaron (la primera vez, todos). */
  sync(state: MatchState, data: DataSet, localPlayer: number): number[] {
    const marks = new Map<number, TaskKind>();
    for (const t of state.tasks) if (t.owner === localPlayer) marks.set(t.tile, t.kind);
    const changed: number[] = [];
    const total = state.width * state.height;
    for (let i = 0; i < total; i++) {
      const next = styleForTile(state, data, i, marks.get(i));
      const prev = this.styles[i];
      if (!prev || !same(prev, next)) {
        this.styles[i] = next;
        changed.push(i);
      }
    }
    return changed;
  }
}

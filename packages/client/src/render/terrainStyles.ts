import type { DataSet, MatchState, TaskKind } from '@dm/shared';
import { FOG, styleForTile, type TileStyle } from './tileStyle';

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
  sync(
    state: MatchState,
    data: DataSet,
    localPlayer: number,
    /** Niebla de guerra: lo que se ve ahora y lo que ya se vio alguna vez. Sin ella, todo se ve. */
    fog: { visible: Uint8Array; seen: ArrayLike<number> } | null = null,
  ): number[] {
    const marks = new Map<number, TaskKind>();
    for (const t of state.tasks) if (t.owner === localPlayer) marks.set(t.tile, t.kind);
    const changed: number[] = [];
    const total = state.width * state.height;
    for (let i = 0; i < total; i++) {
      const f = fog
        ? fog.visible[i] === 1
          ? FOG.visible
          : fog.seen[i] === 1
            ? FOG.remembered
            : FOG.unseen
        : 1;
      const next = styleForTile(state, data, i, marks.get(i), f);
      const prev = this.styles[i];
      if (!prev || !same(prev, next)) {
        this.styles[i] = next;
        changed.push(i);
      }
    }
    return changed;
  }
}

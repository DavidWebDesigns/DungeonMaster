import { rulesOf, taskSeconds, type DataSet, type MatchState } from '@dm/shared';
import { crackStage } from '../feel/anim';
import { tileXY } from './tilePoint';
import type { OverlayTile } from './overlayView';

/** Primera y segunda grieta: más oscuras y opacas cuanto más avanzada está la excavación. */
const STAGE_LOOK: ReadonlyArray<{ color: [number, number, number]; alpha: number }> = [
  { color: [0, 0, 0], alpha: 0 },
  { color: [0.18, 0.12, 0.08], alpha: 0.35 },
  { color: [0.05, 0.03, 0.02], alpha: 0.7 },
];

/** Muros que los Imps del jugador están excavando ahora, con su etapa de grieta. Solo dibujo. */
export function crackTiles(state: MatchState, data: DataSet, player: number): OverlayTile[] {
  const rules = rulesOf(data);
  const out: OverlayTile[] = [];
  for (const imp of state.imps) {
    if (imp.owner !== player || imp.mode !== 'working' || imp.held) continue;
    const task = state.tasks.find((t) => t.id === imp.taskId);
    if (!task || task.kind !== 'dig') continue;
    const stage = crackStage(imp.work, taskSeconds(state, rules, task));
    if (stage === 0) continue;
    const look = STAGE_LOOK[stage]!;
    out.push({ tile: tileXY(state.width, task.tile), color: look.color, alpha: look.alpha });
  }
  return out;
}

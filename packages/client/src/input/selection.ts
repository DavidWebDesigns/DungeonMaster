/**
 * Selección de tiles por arrastre (excavar, reclamar, reforzar). Lógica pura: sin DOM ni Babylon.
 */
import {
  canClaim,
  canDig,
  canReinforce,
  tileIndex,
  type Command,
  type MatchState,
  type Point,
  type Rules,
} from '@dm/shared';

export type TileAction = 'dig' | 'cancelDig' | 'claim' | 'reinforce';

export interface Size {
  width: number;
  height: number;
}

/** Rectángulo de tiles entre dos esquinas de arrastre (inclusivo), recortado al mapa. */
export function dragRect(
  a: Point,
  b: Point,
  map: Size,
): { x: number; y: number; w: number; h: number } {
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const x1 = Math.min(map.width - 1, Math.max(a.x, b.x));
  const y1 = Math.min(map.height - 1, Math.max(a.y, b.y));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0 + 1), h: Math.max(0, y1 - y0 + 1) };
}

/** Tiles del rectángulo ordenados desde el ancla hacia afuera (así un pasillo se marca de dentro hacia afuera). */
export function rectTiles(
  rect: { x: number; y: number; w: number; h: number },
  anchor: Point,
): Point[] {
  const out: Point[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++)
    for (let x = rect.x; x < rect.x + rect.w; x++) out.push({ x, y });
  const dist = (p: Point) => Math.max(Math.abs(p.x - anchor.x), Math.abs(p.y - anchor.y));
  // Orden estable: por distancia al ancla y, a igual distancia, por fila y columna (ya vienen así).
  return out
    .map((p, i) => ({ p, i, d: dist(p) }))
    .sort((u, v) => u.d - v.d || u.i - v.i)
    .map((u) => u.p);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('El tamaño de cada trozo debe ser al menos 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Comandos para aplicar una acción a una selección; la simulación admite hasta `maxTiles` tiles por comando. */
export function selectionCommands(
  action: TileAction,
  tiles: readonly Point[],
  maxTiles: number,
): Command[] {
  return chunk(tiles, maxTiles).map((t) => ({ type: action, tiles: t }) as Command);
}

/** ¿Tiene sentido la acción sobre este tile? (Solo para colorear; el veredicto final es de la simulación.) */
export function tileAccepts(
  action: TileAction,
  state: MatchState,
  rules: Rules,
  tile: Point,
  playerId: number,
): boolean {
  if (tile.x < 0 || tile.y < 0 || tile.x >= state.width || tile.y >= state.height) return false;
  const i = tileIndex(state, tile.x, tile.y);
  switch (action) {
    case 'dig':
      return canDig(state, rules, i, playerId);
    case 'claim':
      return canClaim(state, rules, i, playerId);
    case 'reinforce':
      return canReinforce(state, rules, i, playerId);
    case 'cancelDig':
      return state.tasks.some((t) => t.owner === playerId && t.tile === i && t.kind === 'dig');
  }
}

/** Reparte la selección en tiles que la acción aceptará y tiles que no, para pintarlos distinto. */
export function highlightSelection(
  action: TileAction,
  state: MatchState,
  rules: Rules,
  tiles: readonly Point[],
  playerId: number,
): { valid: Point[]; invalid: Point[] } {
  const valid: Point[] = [];
  const invalid: Point[] = [];
  for (const t of tiles) (tileAccepts(action, state, rules, t, playerId) ? valid : invalid).push(t);
  return { valid, invalid };
}

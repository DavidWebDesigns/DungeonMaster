/**
 * Fantasma de una sala al arrastrar: rectángulo, coste y si se puede construir.
 * Usa `previewCommand`, así que las reglas son exactamente las de la simulación.
 */
import {
  planRoomBuild,
  previewCommand,
  rulesOf,
  type DataSet,
  type ErrorCode,
  type MatchState,
  type Point,
} from '@dm/shared';
import type { Size } from './selection';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Rectángulo de la sala al arrastrar desde `anchor` hasta `current`. Si el arrastre es más pequeño que el
 * tamaño mínimo de la sala, se amplía en la dirección del arrastre; así un simple clic ya muestra una sala válida.
 */
export function roomRectFromDrag(
  minSize: { w: number; h: number },
  anchor: Point,
  current: Point,
  map: Size,
): Rect {
  const stretch = (a: number, b: number, min: number, limit: number): [number, number] => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    let start = lo;
    let len = hi - lo + 1;
    if (len < min) {
      len = min;
      // Hacia donde apunta el arrastre; si es un clic, hacia el lado positivo.
      start = b < a ? a - min + 1 : a;
    }
    // Si se sale del mapa se desplaza para que siga entrando entero.
    start = Math.max(0, Math.min(start, limit - len));
    return [start, len];
  };
  const [x, w] = stretch(anchor.x, current.x, minSize.w, map.width);
  const [y, h] = stretch(anchor.y, current.y, minSize.h, map.height);
  return { x, y, w, h };
}

export interface RoomPreview {
  rect: Rect;
  /** Se puede construir ahora mismo. */
  valid: boolean;
  /** Motivo si no se puede (NO_GOLD se pinta distinto a un lugar inválido). */
  error?: ErrorCode;
  /** Coste total en oro. */
  cost: number;
  /**
   * Cómo se repartirá lo construido (la misma función que usa la simulación): una entrada por sala resultante, con su
   * nivel final (= tiles) y si amplía una sala que ya existía. Vacío si no se puede construir.
   */
  pieces: RoomPiece[];
}

export interface RoomPiece {
  /** Índices de tile de la sala resultante. */
  tiles: number[];
  /** Nivel final de la sala (su número de tiles). */
  level: number;
  /** Amplía una sala que ya existía en vez de abrir una nueva. */
  extends: boolean;
}

export function previewRoom(
  state: MatchState,
  data: DataSet,
  playerId: number,
  room: string,
  rect: Rect,
): RoomPreview {
  const def = data.rooms.find((r) => r.id === room);
  const cost = (def?.goldPerTile ?? 0) * rect.w * rect.h;
  const res = previewCommand(state, data, playerId, { type: 'buildRoom', room, rect });
  if (!res.ok) return { rect, valid: false, error: res.error, cost, pieces: [] };
  const pieces = planRoomBuild(state, rulesOf(data), playerId, room, rect).map((p) => ({
    tiles: p.tiles,
    level: p.tiles.length,
    extends: p.roomId !== null,
  }));
  return { rect, valid: true, cost, pieces };
}

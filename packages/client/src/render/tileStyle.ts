/**
 * Cómo se ve cada tile: altura del bloque y color. Función pura del estado de la simulación.
 * El tile se dibuja como un cubo estirado: muros altos, suelos casi planos.
 */
import type { DataSet, MatchState, TaskKind } from '@dm/shared';
import { mix, playerColor, ROOM_COLORS, type RGB } from './palette';

export interface TileStyle {
  height: number;
  color: RGB;
}

const WALL = 1;

const BASE: Readonly<Record<string, TileStyle>> = {
  solidRock: { height: 1.6, color: [0.16, 0.15, 0.19] },
  earth: { height: WALL, color: [0.42, 0.28, 0.17] },
  reinforcedWall: { height: WALL, color: [0.36, 0.38, 0.46] },
  // Nivel 2: más oscuro y un poco más alto, para distinguirlo a simple vista.
  reinforcedWall2: { height: 1.15, color: [0.22, 0.24, 0.34] },
  goldVein: { height: WALL, color: [0.82, 0.64, 0.12] },
  diamondVein: { height: WALL, color: [0.45, 0.92, 0.98] },
  neutralFloor: { height: 0.08, color: [0.3, 0.26, 0.23] },
  claimedFloor: { height: 0.1, color: [0.24, 0.2, 0.2] },
  water: { height: 0.05, color: [0.15, 0.35, 0.7] },
  lava: { height: 0.05, color: [0.95, 0.38, 0.1] },
};

const FALLBACK: TileStyle = { height: 0.1, color: [1, 0, 1] };
const ROOM_HEIGHT = 0.16;

/** Tinte de las marcas del jugador sobre un tile con tarea pendiente. */
const MARK: Readonly<Record<TaskKind, { color: RGB; amount: number }>> = {
  dig: { color: [1, 0.92, 0.45], amount: 0.42 },
  reinforce: { color: [0.45, 0.65, 1], amount: 0.42 },
  claim: { color: [1, 1, 1], amount: 0.3 },
  buildTrap: { color: [1, 0.55, 0.25], amount: 0.4 },
  // Llevar cuerpos no tiñe el tile.
  rescue: { color: [1, 1, 1], amount: 0 },
  bury: { color: [1, 1, 1], amount: 0 },
  repairTrap: { color: [0.5, 1, 0.6], amount: 0.35 },
};

/** Cuánto se oscurece un tile según la niebla de guerra. */
export const FOG = { visible: 1, remembered: 0.5, unseen: 0.07 } as const;

export function styleForTile(
  state: MatchState,
  data: DataSet,
  tile: number,
  marked: TaskKind | undefined,
  /** 1 = a la vista; menos = en la niebla. */
  fog = 1,
): TileStyle {
  const def = data.terrain[state.terrain[tile] as number];
  const base = (def && BASE[def.id]) || FALLBACK;
  let height = base.height;
  let color = base.color;

  const owner = state.owner[tile] as number;
  const roomId = state.roomAt[tile] as number;
  if (roomId) {
    const room = state.rooms.find((r) => r.id === roomId);
    if (room) {
      height = ROOM_HEIGHT;
      color = mix(ROOM_COLORS[room.type] ?? FALLBACK.color, playerColor(room.owner), 0.25);
      // Dos salas del mismo tipo pegadas no tienen borde: se distinguen por un ligero cambio de tono según su id.
      if (room.id % 2 === 0) color = mix(color, [1, 1, 1], 0.12);
    }
  } else if (owner !== 0) {
    // Suelo reclamado (o muro reforzado): lleva el color de su dueño.
    color = mix(color, playerColor(owner), def?.walkable ? 0.42 : 0.2);
  }
  if (marked) color = mix(color, MARK[marked].color, MARK[marked].amount);
  if (fog < 1) color = [color[0] * fog, color[1] * fog, color[2] * fog];
  return { height, color };
}

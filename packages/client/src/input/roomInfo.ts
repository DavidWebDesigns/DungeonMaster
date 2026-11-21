/**
 * Textos de las salas para la interfaz: lo que va a pasar al construir (niveles resultantes y coste) y la tarjeta de una
 * sala bajo el cursor. Puro: solo formatea datos que ya calculó la simulación.
 */
import type { DataSet, MatchState } from '@dm/shared';
import type { RoomPreview } from './buildPreview';

const fmt = (n: number) => n.toLocaleString('es');

/** "Guarida: sala de nivel 10 + sala nueva de nivel 2 · 3.600 de oro". Vacío si no se puede construir. */
export function roomPreviewText(preview: RoomPreview, roomName: string): string {
  if (!preview.valid || preview.pieces.length === 0) return '';
  // De mayor a menor nivel (las ampliaciones primero), para que el texto no dependa del orden interno.
  const ordered = [...preview.pieces].sort(
    (a, b) => b.level - a.level || Number(b.extends) - Number(a.extends),
  );
  const parts = ordered.map((p) =>
    p.extends ? `amplía una sala a nivel ${p.level}` : `sala nueva de nivel ${p.level}`,
  );
  return `${roomName}: ${parts.join(' + ')} · ${fmt(preview.cost)} de oro`;
}

/** "Biblioteca · nivel 7/10". Vacío si el tile no tiene sala. */
export function roomHoverText(state: MatchState, data: DataSet, tile: number): string {
  const id = state.roomAt[tile] as number;
  const room = id ? state.rooms.find((r) => r.id === id) : undefined;
  if (!room) return '';
  const def = data.rooms.find((r) => r.id === room.type);
  if (!def) return '';
  const max = def.maxTiles;
  return max === undefined
    ? `${def.name}`
    : `${def.name} · nivel ${room.tiles.length}/${max}${room.tiles.length >= max ? ' (completa)' : ''}`;
}

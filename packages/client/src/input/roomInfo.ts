/**
 * Textos de las salas para la interfaz: lo que va a pasar al construir (niveles resultantes y coste) y la tarjeta de una
 * sala bajo el cursor. Puro: solo formatea datos que ya calculó la simulación.
 */
import { roomTileCost, rulesOf, type DataSet, type MatchState } from '@dm/shared';
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

export interface CostTag {
  text: string;
  /** `ok`: se puede construir; `poor`: el sitio vale pero falta oro; `invalid`: no se puede ahí. */
  tone: 'ok' | 'poor' | 'invalid';
}

/**
 * Etiqueta que sigue al cursor al construir, en tiempo real: el precio de lo que se va a colocar y cómo sube.
 * Con un solo tile dice qué número de tile es dentro de su sala (el precio crece un 20 % por tile) y cuánto más
 * cuesta que el primero; con varios, los niveles resultantes y el total. Con poco oro dice cuánto falta, y en un sitio
 * inválido, por qué.
 */
export function roomCostTag(
  data: DataSet,
  preview: RoomPreview,
  roomId: string,
  gold: number,
  invalidText: string,
): CostTag {
  const def = data.rooms.find((r) => r.id === roomId);
  const name = def?.name ?? roomId;
  if (!preview.valid && preview.error !== 'NO_GOLD')
    return { tone: 'invalid', text: `${name}: ${invalidText}` };
  const tone = preview.valid ? 'ok' : 'poor';
  const missing = preview.valid ? '' : ` · te faltan ${fmt(Math.ceil(preview.cost - gold))}`;
  const single = preview.rect.w * preview.rect.h === 1 && preview.pieces.length === 1;
  const [piece] = preview.pieces;
  if (single && piece && def) {
    const price = roomTileCost(rulesOf(data), roomId, piece.level);
    const percent = Math.round((price / Math.max(1, def.goldPerTile) - 1) * 100);
    const rise = percent > 0 ? `+${percent} % sobre el precio base` : 'precio base';
    const where = piece.extends ? `amplía la sala a nivel ${piece.level}` : 'sala nueva de nivel 1';
    return {
      tone,
      text: `${name} · tile n.º ${piece.level}: ${fmt(price)} de oro (${rise}) · ${where}${missing}`,
    };
  }
  const levels = [...preview.pieces]
    .sort((a, b) => b.level - a.level)
    .map((p) => `nivel ${p.level}`)
    .join(' + ');
  return {
    tone,
    text: `${name}${levels ? ` · ${levels}` : ''} · ${fmt(preview.cost)} de oro${missing}`,
  };
}

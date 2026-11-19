import type { DataKey } from './dataSet';

/** Nombre de archivo de cada clave, relativo a /data/mvp. El mapa depende de global.map.id. */
export const DATA_FILE_NAMES: Record<Exclude<DataKey, 'map'>, string> = {
  global: 'global.json',
  terrain: 'terrain.json',
  rooms: 'rooms.json',
  creatures: 'creatures.json',
  spells: 'spells.json',
  traps: 'traps.json',
  pve: 'pve.json',
  progression: 'progression.json',
  mood: 'mood.json',
  economy: 'economy.json',
};

export function mapFileName(mapId: string): string {
  return `maps/${mapId}.json`;
}

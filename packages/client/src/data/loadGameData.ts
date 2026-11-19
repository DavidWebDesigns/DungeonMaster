/**
 * Carga los JSON de /data/mvp dentro del navegador (Vite los empaqueta) y los valida con zod,
 * igual que hace el servidor al arrancar. Si algo está roto, falla con un mensaje legible.
 */
import { formatDataErrors, parseDataSet, type DataSet, type RawDataFiles } from '@dm/shared';
import global from '../../../../data/mvp/global.json';
import terrain from '../../../../data/mvp/terrain.json';
import rooms from '../../../../data/mvp/rooms.json';
import creatures from '../../../../data/mvp/creatures.json';
import spells from '../../../../data/mvp/spells.json';
import traps from '../../../../data/mvp/traps.json';
import progression from '../../../../data/mvp/progression.json';
import mood from '../../../../data/mvp/mood.json';
import economy from '../../../../data/mvp/economy.json';
import map from '../../../../data/mvp/maps/map-4p-01.json';

export function rawGameData(): RawDataFiles {
  return { global, terrain, rooms, creatures, spells, traps, progression, mood, economy, map };
}

export function loadGameData(raw: RawDataFiles = rawGameData()): DataSet {
  const result = parseDataSet(structuredClone(raw));
  if (!result.ok) throw new Error(`Datos del juego inválidos:\n${formatDataErrors(result.errors)}`);
  return result.data;
}

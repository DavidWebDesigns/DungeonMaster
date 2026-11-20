/**
 * Utilidades de prueba: carga los JSON reales de /data/mvp como objetos sin validar,
 * para que cada prueba pueda romper una copia y comprobar que el validador lo detecta.
 * Solo se usa desde archivos *.test.ts.
 */
import type { RawDataFiles } from './dataSet';
import global from '../../../../data/mvp/global.json';
import terrain from '../../../../data/mvp/terrain.json';
import rooms from '../../../../data/mvp/rooms.json';
import creatures from '../../../../data/mvp/creatures.json';
import spells from '../../../../data/mvp/spells.json';
import traps from '../../../../data/mvp/traps.json';
import abilities from '../../../../data/mvp/abilities.json';
import pve from '../../../../data/mvp/pve.json';
import progression from '../../../../data/mvp/progression.json';
import mood from '../../../../data/mvp/mood.json';
import economy from '../../../../data/mvp/economy.json';
import map from '../../../../data/mvp/maps/map-4p-01.json';

/** Copia profunda nueva en cada llamada: las pruebas pueden mutarla sin afectar a otras. */
export function realRawData(): RawDataFiles {
  return structuredClone({
    global,
    terrain,
    rooms,
    creatures,
    spells,
    traps,
    abilities,
    pve,
    progression,
    mood,
    economy,
    map,
  });
}

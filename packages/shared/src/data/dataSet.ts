import type { z } from 'zod';
import {
  CreaturesFile,
  EconomyConfig,
  GlobalConfig,
  MapFile,
  MoodConfig,
  ProgressionConfig,
  RoomsFile,
  SpellsFile,
  TerrainFile,
  TrapsFile,
} from '../schemas';
import { validateDataSet } from './validateDataSet';
import { DATA_FILE_NAMES, mapFileName } from './files';

export { DATA_FILE_NAMES, mapFileName } from './files';

/** Conjunto completo de datos del juego, ya validado. */
export interface DataSet {
  global: GlobalConfig;
  terrain: TerrainFile;
  rooms: RoomsFile;
  creatures: CreaturesFile;
  spells: SpellsFile;
  traps: TrapsFile;
  progression: ProgressionConfig;
  mood: MoodConfig;
  economy: EconomyConfig;
  map: MapFile;
}

export type DataKey = keyof DataSet;

/** Los JSON tal como se leyeron del disco (o se importaron en el navegador), sin validar. */
export type RawDataFiles = Record<DataKey, unknown>;

export interface DataError {
  /** Archivo afectado, relativo a /data/mvp (ej. "creatures.json"). */
  file: string;
  /** Ruta dentro del JSON (ej. "[2].base.hp"). Vacía si el error es del archivo completo. */
  path: string;
  message: string;
}

export type DataResult = { ok: true; data: DataSet } | { ok: false; errors: DataError[] };

const SCHEMAS: Record<DataKey, z.ZodType> = {
  global: GlobalConfig,
  terrain: TerrainFile,
  rooms: RoomsFile,
  creatures: CreaturesFile,
  spells: SpellsFile,
  traps: TrapsFile,
  progression: ProgressionConfig,
  mood: MoodConfig,
  economy: EconomyConfig,
  map: MapFile,
};

export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path
    .map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`))
    .join('')
    .replace(/^\./, '');
}

function fileNameFor(key: DataKey, mapId: string): string {
  return key === 'map' ? mapFileName(mapId) : DATA_FILE_NAMES[key];
}

/**
 * Valida cada archivo contra su esquema y, si todos pasan, valida las referencias
 * cruzadas entre archivos. Función pura: no lee el disco.
 */
export function parseDataSet(raw: RawDataFiles): DataResult {
  const errors: DataError[] = [];
  const parsed: Partial<Record<DataKey, unknown>> = {};
  const mapId =
    typeof raw.global === 'object' && raw.global !== null && 'map' in raw.global
      ? String((raw.global as { map?: { id?: unknown } }).map?.id ?? '?')
      : '?';

  for (const key of Object.keys(SCHEMAS) as DataKey[]) {
    const result = SCHEMAS[key].safeParse(raw[key]);
    if (result.success) {
      parsed[key] = result.data;
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          file: fileNameFor(key, mapId),
          path: formatPath(issue.path),
          message: issue.message,
        });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const data = parsed as DataSet;
  const crossErrors = validateDataSet(data);
  if (crossErrors.length > 0) return { ok: false, errors: crossErrors };
  return { ok: true, data };
}

export function formatDataErrors(errors: readonly DataError[]): string {
  return errors.map((e) => `  ✗ ${e.file}${e.path ? ` → ${e.path}` : ''}: ${e.message}`).join('\n');
}

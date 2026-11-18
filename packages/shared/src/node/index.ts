/**
 * Utilidades que solo funcionan en Node (servidor y herramientas).
 * El navegador nunca importa este módulo.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataKey, DataResult, RawDataFiles } from '../data';
import { DATA_FILE_NAMES, mapFileName, parseDataSet } from '../data';

/** Carpeta /data/mvp del repositorio. */
export const DEFAULT_DATA_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../data/mvp',
);

function readJson(path: string): { ok: true; value: unknown } | { ok: false; message: string } {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { ok: false, message: 'no se encontró el archivo' };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    return { ok: false, message: `JSON inválido: ${(e as Error).message}` };
  }
}

/** Lee los JSON de una carpeta de datos y los valida. */
export function loadDataFromDisk(dir: string = DEFAULT_DATA_DIR): DataResult {
  const raw: Partial<RawDataFiles> = {};
  const errors: { file: string; path: string; message: string }[] = [];

  for (const [key, file] of Object.entries(DATA_FILE_NAMES) as [DataKey, string][]) {
    const r = readJson(join(dir, file));
    if (r.ok) raw[key] = r.value;
    else errors.push({ file, path: '', message: r.message });
  }

  const mapId = (raw.global as { map?: { id?: unknown } } | undefined)?.map?.id;
  if (typeof mapId === 'string') {
    const file = mapFileName(mapId);
    const r = readJson(join(dir, file));
    if (r.ok) raw.map = r.value;
    else errors.push({ file, path: '', message: r.message });
  } else if (raw.global !== undefined) {
    errors.push({ file: 'global.json', path: 'map.id', message: 'falta el id del mapa' });
  }

  if (errors.length > 0) return { ok: false, errors };
  return parseDataSet(raw as RawDataFiles);
}

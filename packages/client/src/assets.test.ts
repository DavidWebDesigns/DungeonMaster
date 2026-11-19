/**
 * Guarda de los modelos 3D: el manifiesto es válido, cada modelo que declara existe en disco y se usa en los datos.
 * Todavía no hay .glb reales (el cliente usa placeholders), así que hoy el manifiesto está vacío y esto solo vigila el futuro.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AssetManifest } from '@dm/shared';
import { loadGameData } from './data/loadGameData';

const root = resolve(__dirname, '../../../assets');
const manifest = AssetManifest.parse(
  JSON.parse(readFileSync(resolve(root, 'assetManifest.json'), 'utf8')),
);
const data = loadGameData();

describe('assetManifest.json', () => {
  it('cada modelo declarado existe en disco', () => {
    const missing = Object.entries(manifest.models)
      .filter(([, m]) => !existsSync(resolve(root, m.file)))
      .map(([id, m]) => `${id} → ${m.file}`);
    expect(missing).toEqual([]);
  });

  it('no declara modelos que los datos no usan (un id mal escrito sería un modelo que nunca se ve)', () => {
    const used = new Set<string>([
      ...data.creatures.map((c) => c.modelId),
      ...data.rooms.map((r) => r.modelId),
      ...data.traps.map((t) => t.modelId),
    ]);
    const orphans = Object.keys(manifest.models).filter((id) => !used.has(id));
    expect(orphans).toEqual([]);
  });

  it('rechaza una ruta que no sea un .glb de models/', () => {
    expect(
      AssetManifest.safeParse({ version: 1, models: { a: { file: 'otro/a.png' } } }).success,
    ).toBe(false);
  });
});

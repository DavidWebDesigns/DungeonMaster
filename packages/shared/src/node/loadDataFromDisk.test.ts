import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DATA_DIR, loadDataFromDisk } from './index';

const temps: string[] = [];
function copyOfData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dm-data-'));
  temps.push(dir);
  cpSync(DEFAULT_DATA_DIR, dir, { recursive: true });
  return dir;
}

afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('loadDataFromDisk', () => {
  it('carga y valida /data/mvp', () => {
    const r = loadDataFromDisk();
    expect(r.ok).toBe(true);
  });

  it('informa un archivo que falta', () => {
    const dir = copyOfData();
    rmSync(join(dir, 'spells.json'));
    const r = loadDataFromDisk(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual(expect.objectContaining({ file: 'spells.json' }));
  });

  it('informa JSON mal escrito', () => {
    const dir = copyOfData();
    writeFileSync(join(dir, 'mood.json'), '{ "min": 0, ');
    const r = loadDataFromDisk(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.message).toMatch(/JSON inválido/);
  });

  it('busca el mapa indicado en global.map.id', () => {
    const dir = copyOfData();
    rmSync(join(dir, 'maps', 'map-4p-01.json'));
    const r = loadDataFromDisk(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.file).toBe('maps/map-4p-01.json');
  });
});

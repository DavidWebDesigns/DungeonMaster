import { describe, expect, it } from 'vitest';
import { createMatch, tileIndex, step, applyCommand } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { styleForTile } from './tileStyle';
import { TerrainStyles } from './terrainStyles';

const data = loadGameData();
const fresh = () => createMatch({ playerCount: 1 }, data, 1);
const at = (s: ReturnType<typeof fresh>, x: number, y: number) => tileIndex(s, x, y);

describe('styleForTile', () => {
  it('los muros son altos y los suelos casi planos', () => {
    const s = fresh();
    expect(styleForTile(s, data, at(s, 11, 4), undefined).height).toBe(1);
    expect(styleForTile(s, data, at(s, 0, 0), undefined).height).toBeGreaterThan(1);
    expect(styleForTile(s, data, at(s, 3, 8), undefined).height).toBeLessThan(0.2);
  });

  it('cada tipo de terreno tiene un color distinto', () => {
    const s = fresh();
    const ids = new Set<string>();
    for (const t of [at(s, 0, 0), at(s, 11, 4), at(s, 14, 4), at(s, 20, 6), at(s, 41, 7)]) {
      ids.add(styleForTile(s, data, t, undefined).color.join(','));
    }
    expect(ids.size).toBe(5);
  });

  it('las salas se ven más bajas que los muros y con su color', () => {
    const s = fresh();
    const heart = styleForTile(s, data, at(s, 4, 4), undefined);
    const floor = styleForTile(s, data, at(s, 3, 8), undefined);
    expect(heart.height).toBeGreaterThan(floor.height);
    expect(heart.color).not.toEqual(floor.color);
  });

  it('una marca de excavar aclara el tile y cambia con el tipo de marca', () => {
    const s = fresh();
    const plain = styleForTile(s, data, at(s, 11, 4), undefined);
    const dig = styleForTile(s, data, at(s, 11, 4), 'dig');
    const reinforce = styleForTile(s, data, at(s, 11, 4), 'reinforce');
    expect(dig.color[0] + dig.color[1] + dig.color[2]).toBeGreaterThan(
      plain.color[0] + plain.color[1] + plain.color[2],
    );
    expect(dig.color).not.toEqual(reinforce.color);
  });

  it('un terreno desconocido sale en magenta para notarlo', () => {
    const s = fresh();
    s.terrain[0] = 999;
    expect(styleForTile(s, data, 0, undefined).color).toEqual([1, 0, 1]);
  });
});

describe('TerrainStyles', () => {
  it('la primera sincronización da todos los tiles y la siguiente ninguno', () => {
    const s = fresh();
    const ts = new TerrainStyles();
    expect(ts.sync(s, data, 1)).toHaveLength(64 * 64);
    expect(ts.sync(s, data, 1)).toHaveLength(0);
  });

  it('marcar un tile cambia solo ese tile, y quitarlo lo devuelve', () => {
    const s = fresh();
    const ts = new TerrainStyles();
    ts.sync(s, data, 1);
    applyCommand(s, data, 1, { type: 'dig', tiles: [{ x: 11, y: 4 }] });
    step(s, data);
    expect(ts.sync(s, data, 1)).toEqual([at(s, 11, 4)]);
    applyCommand(s, data, 1, { type: 'cancelDig', tiles: [{ x: 11, y: 4 }] });
    step(s, data);
    expect(ts.sync(s, data, 1)).toEqual([at(s, 11, 4)]);
  });

  it('un tile excavado por un Imp cambia de muro a suelo', () => {
    const s = fresh();
    const ts = new TerrainStyles();
    ts.sync(s, data, 1);
    const before = ts.styles[at(s, 11, 4)]!.height;
    applyCommand(s, data, 1, { type: 'dig', tiles: [{ x: 11, y: 4 }] });
    for (let i = 0; i < 300; i++) step(s, data);
    const changed = ts.sync(s, data, 1);
    expect(changed).toContain(at(s, 11, 4));
    expect(ts.styles[at(s, 11, 4)]!.height).toBeLessThan(before);
  });

  it('las marcas de otro jugador no se dibujan', () => {
    const s = fresh();
    const ts = new TerrainStyles();
    ts.sync(s, data, 1);
    s.tasks.push({
      id: 99,
      owner: 2,
      kind: 'dig',
      tile: at(s, 11, 4),
      reservedBy: 0,
      blockedVersion: -1,
      auto: false,
    });
    expect(ts.sync(s, data, 1)).toHaveLength(0);
  });
});
